package main

import (
	"context"
	"database/sql"
	"log/slog"
	"path/filepath"
	"testing"

	"github.com/bluesky-social/jetstream"
)

const validCID = "bafyreihffx5a2e7k5uwrmmd2szqjc5akl2tqjnpshq6pdinjhyi5s4rlnq"

func newTestIngester(t *testing.T) *ingester {
	t.Helper()
	db, err := openDB(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	cat, err := loadCatalog()
	if err != nil {
		t.Fatal(err)
	}
	return &ingester{db: db, cat: cat, log: slog.New(slog.DiscardHandler)}
}

func tagRecord(adjective string, direction any) map[string]any {
	return map[string]any{
		"subject":   map[string]any{"uri": "at://did:plc:subject/app.bsky.feed.post/3abc", "cid": validCID},
		"adjective": adjective,
		"direction": direction,
		"updatedAt": "2026-09-13T12:00:00.000Z",
	}
}

func commitEvent(did, rkey string, op jetstream.Operation, record map[string]any) jetstream.Event {
	return jetstream.Event{DID: did, Kind: jetstream.KindCommit, Commit: &jetstream.Commit{
		Operation: op, Collection: collection, Rkey: rkey, Record: record,
	}}
}

type row struct {
	did, rkey, adjective string
	direction            int64
}

func allRows(t *testing.T, db *sql.DB) []row {
	t.Helper()
	rs, err := db.Query(`SELECT did, rkey, adjective, direction FROM tags ORDER BY did, rkey`)
	if err != nil {
		t.Fatal(err)
	}
	defer rs.Close()
	var out []row
	for rs.Next() {
		var r row
		if err := rs.Scan(&r.did, &r.rkey, &r.adjective, &r.direction); err != nil {
			t.Fatal(err)
		}
		out = append(out, r)
	}
	return out
}

func savedCursor(t *testing.T, db *sql.DB) uint64 {
	t.Helper()
	var seq uint64
	if err := db.QueryRow(`SELECT seq FROM cursor WHERE id = 1`).Scan(&seq); err != nil {
		t.Fatal(err)
	}
	return seq
}

func apply(t *testing.T, in *ingester, cursor uint64, events ...jetstream.Event) {
	t.Helper()
	if err := in.applyBatch(context.Background(), events, cursor); err != nil {
		t.Fatal(err)
	}
}

func TestOpenDBMigratesOnceAndIsRepeatable(t *testing.T) {
	path := filepath.Join(t.TempDir(), "test.db")
	for range 2 {
		db, err := openDB(path)
		if err != nil {
			t.Fatal(err)
		}
		var n int
		if err := db.QueryRow(`SELECT COUNT(*) FROM schema_version`).Scan(&n); err != nil {
			t.Fatal(err)
		}
		if n != 1 {
			t.Fatalf("schema_version rows = %d, want 1", n)
		}
		if _, err := db.Exec(`SELECT did, rkey, subject_uri, subject_cid, adjective, direction, updated_at FROM tags`); err != nil {
			t.Fatal(err)
		}
		db.Close()
	}
}

func TestFoldCreateUpdateDelete(t *testing.T) {
	in := newTestIngester(t)

	apply(t, in, 10, commitEvent("did:plc:a", "3k1", jetstream.OpCreate, tagRecord("good", float64(1))))
	if got := allRows(t, in.db); len(got) != 1 || got[0] != (row{"did:plc:a", "3k1", "good", 1}) {
		t.Fatalf("after create: %+v", got)
	}

	apply(t, in, 11, commitEvent("did:plc:a", "3k1", jetstream.OpUpdate, tagRecord("bad", int64(-1))))
	if got := allRows(t, in.db); len(got) != 1 || got[0] != (row{"did:plc:a", "3k1", "bad", -1}) {
		t.Fatalf("after update: %+v", got)
	}

	apply(t, in, 12, commitEvent("did:plc:a", "3k1", jetstream.OpDelete, nil))
	if got := allRows(t, in.db); len(got) != 0 {
		t.Fatalf("after delete: %+v", got)
	}
	if c := savedCursor(t, in.db); c != 12 {
		t.Fatalf("cursor = %d, want 12", c)
	}
}

func TestFoldInvalidRecordDeletesExistingRowButAdvancesCursor(t *testing.T) {
	in := newTestIngester(t)
	apply(t, in, 5,
		commitEvent("did:plc:a", "3k1", jetstream.OpCreate, tagRecord("ok", int64(1))),
		commitEvent("did:plc:a", "3k2", jetstream.OpCreate, tagRecord("seventeen chars!!", int64(1))),
		commitEvent("did:plc:a", "3k3", jetstream.OpCreate, tagRecord("fine", int64(2))),
	)
	if got := allRows(t, in.db); len(got) != 2 || got[0].rkey != "3k1" || got[1].rkey != "3k3" {
		t.Fatalf("rows = %+v, want 3k1 and 3k3", got)
	}
	if c := savedCursor(t, in.db); c != 5 {
		t.Fatalf("cursor = %d, want 5", c)
	}

	apply(t, in, 6, commitEvent("did:plc:a", "3k1", jetstream.OpUpdate, tagRecord("seventeen chars!!", int64(1))))
	if got := allRows(t, in.db); len(got) != 1 || got[0].rkey != "3k3" {
		t.Fatalf("rows = %+v, want only 3k3 after invalid update deletes 3k1", got)
	}
	if c := savedCursor(t, in.db); c != 6 {
		t.Fatalf("cursor = %d, want 6", c)
	}
}

func TestFoldNormalisesUpdatedAtToUTC(t *testing.T) {
	in := newTestIngester(t)
	record := tagRecord("ok", int64(1))
	record["updatedAt"] = "2026-09-13T13:00:00.5+01:00"
	apply(t, in, 1, commitEvent("did:plc:a", "3k1", jetstream.OpCreate, record))

	var updatedAt string
	if err := in.db.QueryRow(`SELECT updated_at FROM tags WHERE did = ? AND rkey = ?`, "did:plc:a", "3k1").Scan(&updatedAt); err != nil {
		t.Fatal(err)
	}
	if want := "2026-09-13T12:00:00.500Z"; updatedAt != want {
		t.Fatalf("updated_at = %q, want %q", updatedAt, want)
	}
}

func TestFoldPurgesOnAccountDeletionAndSync(t *testing.T) {
	in := newTestIngester(t)
	apply(t, in, 1,
		commitEvent("did:plc:a", "3k1", jetstream.OpCreate, tagRecord("x", int64(1))),
		commitEvent("did:plc:b", "3k1", jetstream.OpCreate, tagRecord("y", int64(1))),
		commitEvent("did:plc:c", "3k1", jetstream.OpCreate, tagRecord("z", int64(1))),
	)
	apply(t, in, 2,
		jetstream.Event{DID: "did:plc:a", Kind: jetstream.KindAccount, Account: &jetstream.Account{DID: "did:plc:a", Active: false, Status: "deleted"}},
		jetstream.Event{DID: "did:plc:b", Kind: jetstream.KindAccount, Account: &jetstream.Account{DID: "did:plc:b", Active: false, Status: "deactivated"}},
		jetstream.Event{DID: "did:plc:c", Kind: jetstream.KindSync, Sync: &jetstream.Sync{DID: "did:plc:c"}},
	)
	got := allRows(t, in.db)
	if len(got) != 1 || got[0].did != "did:plc:b" {
		t.Fatalf("rows = %+v, want only did:plc:b", got)
	}
}

func TestFoldEmptyBatchKeepsCursor(t *testing.T) {
	in := newTestIngester(t)
	apply(t, in, 7, commitEvent("did:plc:a", "3k1", jetstream.OpCreate, tagRecord("x", int64(1))))
	apply(t, in, 0)
	if c := savedCursor(t, in.db); c != 7 {
		t.Fatalf("cursor = %d, want 7", c)
	}
}
