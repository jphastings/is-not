package main

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
)

func TestHealthHandler(t *testing.T) {
	h := healthHandler()

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/xrpc/_health", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("GET status = %d, want %d", rec.Code, http.StatusOK)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Fatalf("Content-Type = %q, want application/json", ct)
	}
	var body map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if body["version"] == "" {
		t.Fatalf("version is empty")
	}

	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/xrpc/_health", nil))
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("POST status = %d, want %d", rec.Code, http.StatusMethodNotAllowed)
	}
}

func TestAPIHandlerSetsPermissiveCORS(t *testing.T) {
	db := testDB(t)
	h := apiHandler(db)

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/xrpc/_health", nil))
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "*" {
		t.Fatalf("Access-Control-Allow-Origin = %q, want *", got)
	}

	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodOptions, "/xrpc/at.isnot.suggestSubjects", nil))
	if rec.Code != http.StatusNoContent {
		t.Fatalf("OPTIONS status = %d, want %d", rec.Code, http.StatusNoContent)
	}
}

func testDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := openDB(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("openDB: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

// insertReview writes one review row directly, bypassing the ingester: these
// tests are about the query, not the fold.
func insertReview(t *testing.T, db *sql.DB, did, rkey, uri, cid, title, kind, updatedAt string) {
	t.Helper()
	_, err := db.Exec(`
		INSERT INTO reviews (did, rkey, subject_uri, subject_cid, subject_title, subject_type, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		did, rkey, uri, cid, title, kind, updatedAt, updatedAt)
	if err != nil {
		t.Fatalf("insertReview: %v", err)
	}
}

func suggest(t *testing.T, db *sql.DB, query string) suggestSubjectsResponse {
	t.Helper()
	rec := httptest.NewRecorder()
	suggestSubjectsHandler(db).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/xrpc/at.isnot.suggestSubjects?"+query, nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body: %s", rec.Code, rec.Body)
	}
	var body suggestSubjectsResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	return body
}

func TestSuggestSubjectsEmptyQueryReturnsEmptyArray(t *testing.T) {
	db := testDB(t)
	insertReview(t, db, "did:a", "1", "at://a/1", "cid1", "Valheim", "video-game", "2026-01-01T00:00:00Z")

	body := suggest(t, db, "q=")
	if body.Subjects == nil || len(body.Subjects) != 0 {
		t.Fatalf("subjects = %#v, want empty array", body.Subjects)
	}
}

func TestSuggestSubjectsPrefixMatchOutranksContainsRegardlessOfCount(t *testing.T) {
	db := testDB(t)
	// "Valheim" starts with "valheim" but has fewer reviews than "Old Valheim
	// Statue", which only contains it: the prefix match must still come first.
	insertReview(t, db, "did:a", "1", "at://a/valheim", "cid-old", "Valheim", "video-game", "2026-01-01T00:00:00Z")
	insertReview(t, db, "did:b", "1", "at://a/valheim", "cid-mid", "Valheim", "video-game", "2026-01-02T00:00:00Z")
	insertReview(t, db, "did:c", "1", "at://a/valheim", "cid-new", "Valheim", "video-game", "2026-01-03T00:00:00Z")
	for i, did := range []string{"did:d", "did:e", "did:f", "did:g", "did:h"} {
		insertReview(t, db, did, "1", "at://a/statue", "cid-statue", "Old Valheim Statue", "video-game", "2026-01-01T00:00:00Z")
		_ = i
	}

	body := suggest(t, db, "q=VALHEIM")
	if len(body.Subjects) != 2 {
		t.Fatalf("subjects = %#v, want 2", body.Subjects)
	}
	if got := body.Subjects[0]; got.URI != "at://a/valheim" || got.CID != "cid-new" || got.Title != "Valheim" {
		t.Fatalf("first subject = %#v, want the prefix match with its latest cid", got)
	}
	if got := body.Subjects[1].URI; got != "at://a/statue" {
		t.Fatalf("second subject = %q, want the contains match", got)
	}
}

func TestSuggestSubjectsOneEntryPerURIAlphabeticalTiebreak(t *testing.T) {
	db := testDB(t)
	insertReview(t, db, "did:a", "1", "at://a/2", "cid1", "Zelda", "video-game", "2026-01-01T00:00:00Z")
	insertReview(t, db, "did:a", "2", "at://a/1", "cid2", "Elden Ring", "video-game", "2026-01-01T00:00:00Z")
	insertReview(t, db, "did:b", "1", "at://a/2", "cid3", "Zelda", "video-game", "2026-01-01T00:00:00Z")

	body := suggest(t, db, "q=e")
	if len(body.Subjects) != 2 {
		t.Fatalf("subjects = %#v, want one entry per uri", body.Subjects)
	}
	if body.Subjects[0].Title != "Elden Ring" || body.Subjects[1].Title != "Zelda" {
		t.Fatalf("order = [%s, %s], want alphabetical after the count tie", body.Subjects[0].Title, body.Subjects[1].Title)
	}
}

func TestSuggestSubjectsLimitDefaultsAndCaps(t *testing.T) {
	db := testDB(t)
	for i := 0; i < 30; i++ {
		did := "did:" + string(rune('a'+i))
		insertReview(t, db, did, "1", "at://a/"+did, "cid", "Item "+did, "video-game", "2026-01-01T00:00:00Z")
	}

	if body := suggest(t, db, "q=item"); len(body.Subjects) != 8 {
		t.Fatalf("default limit gave %d subjects, want 8", len(body.Subjects))
	}
	if body := suggest(t, db, "q=item&limit=100"); len(body.Subjects) != 25 {
		t.Fatalf("limit=100 gave %d subjects, want capped at 25", len(body.Subjects))
	}
	if body := suggest(t, db, "q=item&limit=3"); len(body.Subjects) != 3 {
		t.Fatalf("limit=3 gave %d subjects, want 3", len(body.Subjects))
	}
}
