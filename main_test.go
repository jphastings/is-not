package main

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"sync/atomic"
	"testing"
	"time"
)

func TestFollowJetstreamRetriesUntilCancelled(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	log := slog.New(slog.NewTextHandler(io.Discard, nil))

	var calls atomic.Int32
	started3 := make(chan struct{})
	attempt := func(ctx context.Context) error {
		if calls.Add(1) <= 2 {
			return errors.New("boom")
		}
		close(started3)
		<-ctx.Done()
		return ctx.Err()
	}

	done := make(chan struct{})
	go func() {
		followJetstream(ctx, log, attempt, time.Millisecond, 5*time.Millisecond, time.Hour)
		close(done)
	}()

	select {
	case <-started3:
	case <-time.After(2 * time.Second):
		t.Fatal("attempt was not called a third time")
	}
	cancel()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("followJetstream did not return after ctx was cancelled")
	}

	if got := calls.Load(); got != 3 {
		t.Fatalf("attempt called %d times, want 3", got)
	}
}
