package main

import (
	"context"
	"database/sql"
	"errors"
	"log/slog"
	"os"
	"os/signal"
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

	var cursor uint64
	if err := db.QueryRow(`SELECT seq FROM cursor WHERE id = 1`).Scan(&cursor); err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}

	opts := []jetstream.Option{jetstream.WithCollection(collection), jetstream.WithLogger(log)}
	if key := os.Getenv("JETSTREAM_API_KEY"); key != "" {
		// With a key we always resume via archive replay: cursor 0 replays from the
		// start, a non-zero cursor resumes from it even if it's older than the live
		// tail's lookback window.
		opts = append(opts, jetstream.WithAPIKey(key), jetstream.WithAfterSeq(cursor))
	} else if cursor > 0 {
		opts = append(opts, jetstream.WithLiveCursor(cursor))
	}

	host := env("JETSTREAM_HOST", "jetstream.us-east.bsky.network")
	client, err := jetstream.Subscribe(host, opts...)
	if err != nil {
		return err
	}
	defer client.Close()
	log.Info("following jetstream", "host", host, "collection", collection, "cursor", cursor)

	in := &ingester{db: db, cat: cat, log: log, resolveHandle: handleResolver()}
	return in.run(ctx, client)
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// handleResolver looks up a DID's verified handle. Verification costs a second
// network round trip per new DID, which is fine at our volume and means we never
// display a handle the account no longer controls.
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
