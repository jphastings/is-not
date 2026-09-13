package main

import (
	"context"
	"database/sql"
	"errors"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/bluesky-social/jetstream"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	log := slog.New(slog.NewTextHandler(os.Stderr, nil))
	if err := run(ctx, log); err != nil {
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
	if cursor > 0 {
		opts = append(opts, jetstream.WithLiveCursor(cursor))
	}
	if key := os.Getenv("JETSTREAM_API_KEY"); key != "" {
		opts = append(opts, jetstream.WithAPIKey(key))
		if cursor == 0 {
			opts = append(opts, jetstream.WithAfterSeq(0))
		}
	}

	host := env("JETSTREAM_HOST", "jetstream.us-east.bsky.network")
	client, err := jetstream.Subscribe(host, opts...)
	if err != nil {
		return err
	}
	defer client.Close()
	log.Info("following jetstream", "host", host, "collection", collection, "cursor", cursor)

	in := &ingester{db: db, cat: cat, log: log}
	return in.run(ctx, client)
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
