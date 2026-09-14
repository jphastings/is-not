package main

import (
	"context"
	"database/sql"
	"errors"
	"log/slog"
	"path/filepath"
	"testing"

	"github.com/bluesky-social/jetstream"
)

const validCID = "bafyreihffx5a2e7k5uwrmmd2szqjc5akl2tqjnpshq6pdinjhyi5s4rlnq"
const defaultCreatedAt = "2026-09-13T11:00:00.000Z"
const defaultUpdatedAt = "2026-09-13T12:00:00.000Z"

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
	return &ingester{
		db: db, cat: cat, log: slog.New(slog.DiscardHandler),
		resolveHandle: func(context.Context, string) (string, error) { return "", nil },
	}
}

type tagPair struct {
	adjective string
	direction any
}

func oneTag(adjective string, direction any) []tagPair {
	return []tagPair{{adjective, direction}}
}

func reviewRecord(tags []tagPair, createdAt, updatedAt string) map[string]any {
	tagList := make([]any, len(tags))
	for i, tg := range tags {
		tagList[i] = map[string]any{"adjective": tg.adjective, "direction": tg.direction}
	}
	return map[string]any{
		"subject": map[string]any{
			"uri":         "at://did:plc:subject/app.bsky.feed.post/3abc",
			"cid":         validCID,
			"title":       "A Post",
			"type":        "post",
			"identifiers": []any{map[string]any{"key": "imdbId", "value": "tt1"}},
		},
		"tags":      tagList,
		"createdAt": createdAt,
		"updatedAt": updatedAt,
	}
}

func withLocale(record map[string]any, locale string) map[string]any {
	record["locale"] = locale
	return record
}

func storedLocale(t *testing.T, db *sql.DB, rkey string) string {
	t.Helper()
	var locale string
	if err := db.QueryRow(`SELECT locale FROM reviews WHERE rkey = ?`, rkey).Scan(&locale); err != nil {
		t.Fatal(err)
	}
	return locale
}

func commitEvent(did, rkey string, op jetstream.Operation, record map[string]any) jetstream.Event {
	return jetstream.Event{DID: did, Kind: jetstream.KindCommit, Commit: &jetstream.Commit{
		Operation: op, Collection: collection, Rkey: rkey, Record: record,
	}}
}

// A valid review always has at least one tag, so its presence doubles as reviewExists.
func reviewExists(t *testing.T, db *sql.DB, did, rkey string) bool {
	return len(reviewTags(t, db, did, rkey)) > 0
}

func reviewDIDs(t *testing.T, db *sql.DB) []string {
	t.Helper()
	rs, err := db.Query(`SELECT DISTINCT did FROM reviews ORDER BY did`)
	if err != nil {
		t.Fatal(err)
	}
	defer rs.Close()
	var out []string
	for rs.Next() {
		var did string
		if err := rs.Scan(&did); err != nil {
			t.Fatal(err)
		}
		out = append(out, did)
	}
	return out
}

func reviewTags(t *testing.T, db *sql.DB, did, rkey string) map[string]int64 {
	t.Helper()
	rs, err := db.Query(`SELECT adjective, direction FROM review_tags WHERE did = ? AND rkey = ?`, did, rkey)
	if err != nil {
		t.Fatal(err)
	}
	defer rs.Close()
	out := map[string]int64{}
	for rs.Next() {
		var adjective string
		var direction int64
		if err := rs.Scan(&adjective, &direction); err != nil {
			t.Fatal(err)
		}
		out[adjective] = direction
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
		if _, err := db.Exec(`SELECT did, rkey, subject_uri, subject_cid, subject_title, subject_type, created_at, updated_at FROM reviews`); err != nil {
			t.Fatal(err)
		}
		if _, err := db.Exec(`SELECT did, handle, updated_at FROM accounts`); err != nil {
			t.Fatal(err)
		}
		if _, err := db.Exec(`SELECT did, rkey, adjective, direction FROM review_tags`); err != nil {
			t.Fatal(err)
		}
		if _, err := db.Exec(`SELECT did, rkey, key, value FROM review_identifiers`); err != nil {
			t.Fatal(err)
		}
		db.Close()
	}
}

func TestFoldCreateUpdateDelete(t *testing.T) {
	in := newTestIngester(t)

	apply(t, in, 10, commitEvent("did:plc:a", "3k1", jetstream.OpCreate, reviewRecord(oneTag("good", float64(1)), defaultCreatedAt, defaultUpdatedAt)))
	if !reviewExists(t, in.db, "did:plc:a", "3k1") {
		t.Fatal("review missing after create")
	}
	if got := reviewTags(t, in.db, "did:plc:a", "3k1"); len(got) != 1 || got["good"] != 1 {
		t.Fatalf("tags after create = %v", got)
	}

	apply(t, in, 11, commitEvent("did:plc:a", "3k1", jetstream.OpUpdate, reviewRecord(oneTag("bad", int64(-1)), defaultCreatedAt, defaultUpdatedAt)))
	if got := reviewTags(t, in.db, "did:plc:a", "3k1"); len(got) != 1 || got["bad"] != -1 {
		t.Fatalf("tags after update = %v", got)
	}

	apply(t, in, 12, commitEvent("did:plc:a", "3k1", jetstream.OpDelete, nil))
	if reviewExists(t, in.db, "did:plc:a", "3k1") {
		t.Fatal("review still present after delete")
	}
	if c := savedCursor(t, in.db); c != 12 {
		t.Fatalf("cursor = %d, want 12", c)
	}
}

func TestFoldStoresLocaleAndDefaultsToEmpty(t *testing.T) {
	in := newTestIngester(t)
	apply(t, in, 1,
		commitEvent("did:plc:a", "r1", jetstream.OpCreate, withLocale(reviewRecord(oneTag("good", 1), defaultCreatedAt, defaultUpdatedAt), "en-GB")),
		commitEvent("did:plc:a", "r2", jetstream.OpCreate, reviewRecord(oneTag("good", 1), defaultCreatedAt, defaultUpdatedAt)),
	)
	if got := storedLocale(t, in.db, "r1"); got != "en-GB" {
		t.Fatalf("locale = %q, want en-GB", got)
	}
	if got := storedLocale(t, in.db, "r2"); got != "" {
		t.Fatalf("locale = %q, want empty", got)
	}
	apply(t, in, 2, commitEvent("did:plc:a", "r1", jetstream.OpUpdate, reviewRecord(oneTag("good", 1), defaultCreatedAt, defaultUpdatedAt)))
	if got := storedLocale(t, in.db, "r1"); got != "" {
		t.Fatalf("locale after update without one = %q, want empty", got)
	}
}

func TestFoldRejectsMalformedLocale(t *testing.T) {
	in := newTestIngester(t)
	apply(t, in, 1, commitEvent("did:plc:a", "r1", jetstream.OpCreate, withLocale(reviewRecord(oneTag("good", 1), defaultCreatedAt, defaultUpdatedAt), "not a language tag")))
	if reviewExists(t, in.db, "did:plc:a", "r1") {
		t.Fatal("review with a malformed locale was stored")
	}
}

func TestFoldReplacesTagsWholesaleAndKeepsLastOnRepeat(t *testing.T) {
	in := newTestIngester(t)
	apply(t, in, 1, commitEvent("did:plc:a", "3k1", jetstream.OpCreate,
		reviewRecord([]tagPair{{"good", float64(1)}, {"funny", float64(2)}}, defaultCreatedAt, defaultUpdatedAt)))
	if got := reviewTags(t, in.db, "did:plc:a", "3k1"); len(got) != 2 {
		t.Fatalf("tags after create = %v, want 2", got)
	}

	apply(t, in, 2, commitEvent("did:plc:a", "3k1", jetstream.OpUpdate,
		reviewRecord([]tagPair{{"good", float64(1)}, {"good", int64(-1)}}, defaultCreatedAt, defaultUpdatedAt)))
	if got := reviewTags(t, in.db, "did:plc:a", "3k1"); len(got) != 1 || got["good"] != -1 {
		t.Fatalf("tags after update = %v, want only good=-1 (funny gone, repeat keeps last)", got)
	}
}

func TestFoldEmptyTagsInvalid(t *testing.T) {
	in := newTestIngester(t)
	apply(t, in, 1, commitEvent("did:plc:a", "3k1", jetstream.OpCreate, reviewRecord(oneTag("good", float64(1)), defaultCreatedAt, defaultUpdatedAt)))
	apply(t, in, 2, commitEvent("did:plc:a", "3k1", jetstream.OpUpdate, reviewRecord(nil, defaultCreatedAt, defaultUpdatedAt)))
	if reviewExists(t, in.db, "did:plc:a", "3k1") {
		t.Fatal("review with empty tags should be invalid, deleting the existing row")
	}
}

func TestFoldInvalidRecordDeletesExistingRowButAdvancesCursor(t *testing.T) {
	in := newTestIngester(t)
	apply(t, in, 5,
		commitEvent("did:plc:a", "3k1", jetstream.OpCreate, reviewRecord(oneTag("ok", int64(1)), defaultCreatedAt, defaultUpdatedAt)),
		commitEvent("did:plc:a", "3k2", jetstream.OpCreate, reviewRecord(oneTag("seventeen chars!!", int64(1)), defaultCreatedAt, defaultUpdatedAt)),
		commitEvent("did:plc:a", "3k3", jetstream.OpCreate, reviewRecord(oneTag("fine", int64(2)), defaultCreatedAt, defaultUpdatedAt)),
	)
	if !reviewExists(t, in.db, "did:plc:a", "3k1") || reviewExists(t, in.db, "did:plc:a", "3k2") || !reviewExists(t, in.db, "did:plc:a", "3k3") {
		t.Fatal("want only 3k1 and 3k3 to exist (3k2's adjective is too long)")
	}
	if c := savedCursor(t, in.db); c != 5 {
		t.Fatalf("cursor = %d, want 5", c)
	}

	apply(t, in, 6, commitEvent("did:plc:a", "3k1", jetstream.OpUpdate, reviewRecord(oneTag("seventeen chars!!", int64(1)), defaultCreatedAt, defaultUpdatedAt)))
	if reviewExists(t, in.db, "did:plc:a", "3k1") || !reviewExists(t, in.db, "did:plc:a", "3k3") {
		t.Fatal("want only 3k3 after invalid update deletes 3k1")
	}
	if c := savedCursor(t, in.db); c != 6 {
		t.Fatalf("cursor = %d, want 6", c)
	}
}

func TestFoldNormalisesTimestampsToUTC(t *testing.T) {
	in := newTestIngester(t)
	record := reviewRecord(oneTag("ok", int64(1)), "2026-09-13T12:00:00.5+01:00", "2026-09-13T13:00:00.5+01:00")
	apply(t, in, 1, commitEvent("did:plc:a", "3k1", jetstream.OpCreate, record))

	var createdAt, updatedAt string
	if err := in.db.QueryRow(`SELECT created_at, updated_at FROM reviews WHERE did = ? AND rkey = ?`, "did:plc:a", "3k1").Scan(&createdAt, &updatedAt); err != nil {
		t.Fatal(err)
	}
	if want := "2026-09-13T11:00:00.500Z"; createdAt != want {
		t.Fatalf("created_at = %q, want %q", createdAt, want)
	}
	if want := "2026-09-13T12:00:00.500Z"; updatedAt != want {
		t.Fatalf("updated_at = %q, want %q", updatedAt, want)
	}
}

func TestFoldPurgesOnAccountDeletionAndSync(t *testing.T) {
	in := newTestIngester(t)
	apply(t, in, 1,
		commitEvent("did:plc:a", "3k1", jetstream.OpCreate, reviewRecord(oneTag("x", int64(1)), defaultCreatedAt, defaultUpdatedAt)),
		commitEvent("did:plc:b", "3k1", jetstream.OpCreate, reviewRecord(oneTag("y", int64(1)), defaultCreatedAt, defaultUpdatedAt)),
		commitEvent("did:plc:c", "3k1", jetstream.OpCreate, reviewRecord(oneTag("z", int64(1)), defaultCreatedAt, defaultUpdatedAt)),
	)
	apply(t, in, 2,
		jetstream.Event{DID: "did:plc:a", Kind: jetstream.KindAccount, Account: &jetstream.Account{DID: "did:plc:a", Active: false, Status: "deleted"}},
		jetstream.Event{DID: "did:plc:b", Kind: jetstream.KindAccount, Account: &jetstream.Account{DID: "did:plc:b", Active: false, Status: "deactivated"}},
		jetstream.Event{DID: "did:plc:c", Kind: jetstream.KindSync, Sync: &jetstream.Sync{DID: "did:plc:c"}},
	)
	if got := reviewDIDs(t, in.db); len(got) != 1 || got[0] != "did:plc:b" {
		t.Fatalf("dids = %v, want only did:plc:b", got)
	}
}

func TestFoldEmptyBatchKeepsCursor(t *testing.T) {
	in := newTestIngester(t)
	apply(t, in, 7, commitEvent("did:plc:a", "3k1", jetstream.OpCreate, reviewRecord(oneTag("x", int64(1)), defaultCreatedAt, defaultUpdatedAt)))
	apply(t, in, 0)
	if c := savedCursor(t, in.db); c != 7 {
		t.Fatalf("cursor = %d, want 7", c)
	}
}

func identifiers(t *testing.T, db *sql.DB, did, rkey string) [][2]string {
	t.Helper()
	rs, err := db.Query(`SELECT key, value FROM review_identifiers WHERE did = ? AND rkey = ? ORDER BY key, value`, did, rkey)
	if err != nil {
		t.Fatal(err)
	}
	defer rs.Close()
	var out [][2]string
	for rs.Next() {
		var kv [2]string
		if err := rs.Scan(&kv[0], &kv[1]); err != nil {
			t.Fatal(err)
		}
		out = append(out, kv)
	}
	return out
}

func TestFoldStoresSubjectFields(t *testing.T) {
	in := newTestIngester(t)
	apply(t, in, 1, commitEvent("did:plc:a", "3k1", jetstream.OpCreate, reviewRecord(oneTag("x", int64(1)), defaultCreatedAt, defaultUpdatedAt)))

	var title, typ string
	if err := in.db.QueryRow(`SELECT subject_title, subject_type FROM reviews WHERE did = ? AND rkey = ?`, "did:plc:a", "3k1").Scan(&title, &typ); err != nil {
		t.Fatal(err)
	}
	if title != "A Post" || typ != "post" {
		t.Fatalf("subject = %q %q", title, typ)
	}
	if got := identifiers(t, in.db, "did:plc:a", "3k1"); len(got) != 1 || got[0] != [2]string{"imdbId", "tt1"} {
		t.Fatalf("identifiers after create = %v", got)
	}

	updateRecord := reviewRecord(oneTag("x", int64(1)), defaultCreatedAt, defaultUpdatedAt)
	subject := updateRecord["subject"].(map[string]any)
	subject["title"] = "Another Post"
	subject["type"] = "movie"
	subject["identifiers"] = []any{map[string]any{"key": "tmdbId", "value": "2"}}
	apply(t, in, 3, commitEvent("did:plc:a", "3k1", jetstream.OpUpdate, updateRecord))
	if err := in.db.QueryRow(`SELECT subject_title, subject_type FROM reviews WHERE did = ? AND rkey = ?`, "did:plc:a", "3k1").Scan(&title, &typ); err != nil {
		t.Fatal(err)
	}
	if title != "Another Post" || typ != "movie" {
		t.Fatalf("updated subject = %q %q", title, typ)
	}
	if got := identifiers(t, in.db, "did:plc:a", "3k1"); len(got) != 1 || got[0] != [2]string{"tmdbId", "2"} {
		t.Fatalf("identifiers after update = %v, want only tmdbId (old imdbId gone)", got)
	}

	record := reviewRecord(oneTag("y", int64(1)), defaultCreatedAt, defaultUpdatedAt)
	delete(record["subject"].(map[string]any), "identifiers")
	apply(t, in, 4, commitEvent("did:plc:a", "3k2", jetstream.OpCreate, record))
	if got := identifiers(t, in.db, "did:plc:a", "3k2"); len(got) != 0 {
		t.Fatalf("identifiers without any = %v, want none", got)
	}
}

func TestFoldDeletingReviewRemovesTagsAndIdentifiers(t *testing.T) {
	in := newTestIngester(t)
	apply(t, in, 1, commitEvent("did:plc:a", "3k1", jetstream.OpCreate, reviewRecord(oneTag("x", int64(1)), defaultCreatedAt, defaultUpdatedAt)))
	apply(t, in, 2, commitEvent("did:plc:a", "3k1", jetstream.OpDelete, nil))
	var tagCount, idCount int
	if err := in.db.QueryRow(`SELECT COUNT(*) FROM review_tags`).Scan(&tagCount); err != nil {
		t.Fatal(err)
	}
	if err := in.db.QueryRow(`SELECT COUNT(*) FROM review_identifiers`).Scan(&idCount); err != nil {
		t.Fatal(err)
	}
	if tagCount != 0 || idCount != 0 {
		t.Fatalf("review_tags = %d, review_identifiers = %d after delete, want 0, 0", tagCount, idCount)
	}

	apply(t, in, 3,
		commitEvent("did:plc:a", "3k1", jetstream.OpCreate, reviewRecord(oneTag("x", int64(1)), defaultCreatedAt, defaultUpdatedAt)),
		commitEvent("did:plc:b", "3k1", jetstream.OpCreate, reviewRecord(oneTag("y", int64(1)), defaultCreatedAt, defaultUpdatedAt)),
	)
	apply(t, in, 4, jetstream.Event{DID: "did:plc:a", Kind: jetstream.KindAccount, Account: &jetstream.Account{DID: "did:plc:a", Active: false, Status: "deleted"}})
	if got := identifiers(t, in.db, "did:plc:a", "3k1"); len(got) != 0 {
		t.Fatalf("did:plc:a identifiers after account deletion = %v, want none", got)
	}
	if got := identifiers(t, in.db, "did:plc:b", "3k1"); len(got) != 1 {
		t.Fatalf("did:plc:b identifiers after unrelated account deletion = %v, want 1", got)
	}
}

func TestFoldRejectsSubjectWithoutTitle(t *testing.T) {
	in := newTestIngester(t)
	record := reviewRecord(oneTag("x", int64(1)), defaultCreatedAt, defaultUpdatedAt)
	delete(record["subject"].(map[string]any), "title")
	apply(t, in, 1, commitEvent("did:plc:a", "3k1", jetstream.OpCreate, record))
	if reviewExists(t, in.db, "did:plc:a", "3k1") {
		t.Fatal("review with no subject title should not be stored")
	}
}

func identityEvent(did, handle string) jetstream.Event {
	return jetstream.Event{DID: did, Kind: jetstream.KindIdentity, Identity: &jetstream.Identity{DID: did, Handle: handle, Time: "2026-09-13T13:00:00.5+01:00"}}
}

func handles(t *testing.T, db *sql.DB) map[string]string {
	t.Helper()
	rs, err := db.Query(`SELECT did, handle FROM accounts`)
	if err != nil {
		t.Fatal(err)
	}
	defer rs.Close()
	out := map[string]string{}
	for rs.Next() {
		var did, handle string
		if err := rs.Scan(&did, &handle); err != nil {
			t.Fatal(err)
		}
		out[did] = handle
	}
	return out
}

func TestAccountsResolvedOnFirstSightAndUpdatedByIdentityEvents(t *testing.T) {
	in := newTestIngester(t)
	calls := 0
	in.resolveHandle = func(_ context.Context, did string) (string, error) {
		calls++
		if did == "did:plc:b" {
			return "", errors.New("resolver down")
		}
		return "a.example", nil
	}

	apply(t, in, 1,
		commitEvent("did:plc:a", "3k1", jetstream.OpCreate, reviewRecord(oneTag("x", int64(1)), defaultCreatedAt, defaultUpdatedAt)),
		commitEvent("did:plc:a", "3k1b", jetstream.OpCreate, reviewRecord(oneTag("x", int64(1)), defaultCreatedAt, defaultUpdatedAt)),
		commitEvent("did:plc:b", "3k1", jetstream.OpCreate, reviewRecord(oneTag("y", int64(1)), defaultCreatedAt, defaultUpdatedAt)),
	)
	if got := handles(t, in.db); len(got) != 2 || got["did:plc:a"] != "a.example" || got["did:plc:b"] != "" {
		t.Fatalf("accounts after first batch = %v", got)
	}

	apply(t, in, 2, commitEvent("did:plc:a", "3k2", jetstream.OpCreate, reviewRecord(oneTag("z", int64(1)), defaultCreatedAt, defaultUpdatedAt)))
	if calls != 2 {
		t.Fatalf("resolver calls = %d, want 2 (known DIDs are not re-resolved, including within a batch)", calls)
	}

	apply(t, in, 3,
		identityEvent("did:plc:b", "bee.example"),
		identityEvent("did:plc:a", ""),
		identityEvent("did:plc:c", "cee.example"),
	)
	if got := handles(t, in.db); got["did:plc:b"] != "bee.example" || got["did:plc:a"] != "a.example" || got["did:plc:c"] != "cee.example" {
		t.Fatalf("accounts after identity events = %v", got)
	}

	var updatedAt string
	if err := in.db.QueryRow(`SELECT updated_at FROM accounts WHERE did = 'did:plc:b'`).Scan(&updatedAt); err != nil {
		t.Fatal(err)
	}
	if want := "2026-09-13T12:00:00.500Z"; updatedAt != want {
		t.Fatalf("updated_at = %q, want %q", updatedAt, want)
	}

	apply(t, in, 4, identityEvent("did:plc:b", "handle.invalid"))
	if got := handles(t, in.db); got["did:plc:b"] != "" {
		t.Fatalf("did:plc:b handle after handle.invalid = %q, want empty", got["did:plc:b"])
	}
}
