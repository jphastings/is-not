package main

import (
	"context"
	"database/sql"
	"errors"
	"log/slog"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/bluesky-social/jetstream"
	"github.com/jcalabro/atmos"
	"github.com/jcalabro/atmos/identity"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	log := slog.New(slog.NewTextHandler(os.Stderr, nil))
	if err := run(ctx, log); err != nil && !errors.Is(err, context.Canceled) {
		log.Error("exiting", "err", err)
		os.Exit(1)
	}
}

func run(ctx context.Context, log *slog.Logger) error {
	db, err := openDB(env("DATABASE_PATH", "isnot.db"))
	if err != nil {
		return err
	}
	defer db.Close()

	cat, err := loadCatalog()
	if err != nil {
		return err
	}

	lens, err := loadLenses(ctx)
	if err != nil {
		return err
	}
	defer lens.Close(ctx)

	in := &ingester{
		db: db, cat: cat, log: log, lenses: lens,
		resolveHandle: handleResolver(),
		fetchRecord:   recordFetcher(pdsResolver(), pdsClient()),
	}

	runCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	var backfill sync.WaitGroup
	backfill.Go(func() { in.backfillSubjects(runCtx) })

	host := env("JETSTREAM_HOST", "jetstream.us-east.bsky.network")
	apiKey := os.Getenv("JETSTREAM_API_KEY")

	// One attempt: read the cursor fresh (so a retry resumes from wherever the
	// last batch got to), subscribe, and run the ingester until it errors or
	// ctx is done. followJetstream calls this in a loop so a Jetstream-side
	// failure (e.g. a planSnapshot 503) never takes the whole process down.
	attempt := func(ctx context.Context) error {
		var cursor uint64
		if err := db.QueryRow(`SELECT seq FROM cursor WHERE id = 1`).Scan(&cursor); err != nil && !errors.Is(err, sql.ErrNoRows) {
			return err
		}

		opts := []jetstream.Option{jetstream.WithCollection(collection), jetstream.WithLogger(log)}
		if apiKey != "" {
			// With a key we always resume via archive replay: cursor 0 replays from the
			// start, a non-zero cursor resumes from it even if it's older than the live
			// tail's lookback window.
			opts = append(opts, jetstream.WithAPIKey(apiKey), jetstream.WithAfterSeq(cursor))
		} else if cursor > 0 {
			opts = append(opts, jetstream.WithLiveCursor(cursor))
		}

		client, err := jetstream.Subscribe(host, opts...)
		if err != nil {
			return err
		}
		defer client.Close()
		log.Info("following jetstream", "host", host, "collection", collection, "cursor", cursor)

		return in.run(ctx, client)
	}

	errs := make(chan error, 2)
	go func() {
		followJetstream(runCtx, log, attempt, time.Second, time.Minute, 5*time.Minute)
		errs <- nil
		cancel()
	}()
	go func() {
		errs <- serve(runCtx, ":"+env("PORT", "8080"), apiHandler(db), log)
		cancel()
	}()

	var first error
	for range 2 {
		if err := <-errs; err != nil && first == nil {
			first = err
		}
	}
	backfill.Wait()
	return first
}

// followJetstream calls attempt in a loop, retrying with capped exponential
// backoff on any error (including attempt failing before it ever starts
// streaming, e.g. Subscribe itself). It returns only once ctx is done. A
// session that runs at least healthyAfter resets the backoff, so a hiccup
// after a long healthy run doesn't inherit a stale multi-minute delay.
func followJetstream(ctx context.Context, log *slog.Logger, attempt func(context.Context) error, initialBackoff, maxBackoff, healthyAfter time.Duration) {
	backoff := initialBackoff
	for ctx.Err() == nil {
		start := time.Now()
		err := attempt(ctx)
		if ctx.Err() != nil {
			return
		}
		if err != nil {
			log.Error("jetstream attempt failed, retrying", "err", err, "backoff", backoff)
		} else {
			log.Warn("jetstream stream ended, retrying", "backoff", backoff)
		}
		if time.Since(start) >= healthyAfter {
			backoff = initialBackoff
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(backoff):
		}
		if backoff *= 2; backoff > maxBackoff {
			backoff = maxBackoff
		}
	}
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// handleResolver looks up a DID's verified handle. Verification costs a second
// network round trip per new DID, which is fine at our volume. This only verifies
// at first sight; later changes arrive via jetstream identity events and are
// trusted as delivered.
func handleResolver() func(ctx context.Context, did string) (string, error) {
	dir := &identity.Directory{
		Resolver: &identity.DefaultResolver{},
		Cache:    identity.NewLRUCache(10_000, time.Hour),
	}
	return func(ctx context.Context, did string) (string, error) {
		id, err := dir.LookupDID(ctx, atmos.DID(did))
		if err != nil {
			return "", err
		}
		if id.Handle == atmos.HandleInvalid {
			return "", errors.New("declared handle failed verification")
		}
		return string(id.Handle), nil
	}
}
