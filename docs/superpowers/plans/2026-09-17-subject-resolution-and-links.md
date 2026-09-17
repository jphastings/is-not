# Subject resolution and identifier links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The ingester lenses every review's subject from the subject record itself into a shared `subjects` table, and the site links a subject to its public pages (Spotify, MusicBrainz, IMDb, ...) from those lens-derived identifiers.

**Architecture:** The Go ingester already embeds the lenses wasm (`lens.go`); this wires it in. Before each batch's transaction it fetches each unseen subject record from its author's PDS, runs the lens, and upserts `subjects` + `subject_identifiers`. The site LEFT JOINs `subjects` and coalesces onto the poster's title and type. A pure TypeScript table maps identifier keys to URLs, and two small Svelte components render brand-icon links.

**Tech Stack:** Go 1.26 (wazero, atmos, modernc sqlite), SvelteKit 5 + `node:sqlite`, vite-plus (`vp`) for JS tests, Rust lens crate built to wasm by `packages/lenses/build-wasm.sh`, paraglide messages.

**Spec:** `docs/superpowers/specs/2026-09-17-subject-resolution-and-links-design.md`

## Global Constraints

- Migrations are append-only: a new numbered file, never an edit to `001` or `002`.
- Run `go test ./...` at the repo root before every Go commit. It embeds `packages/lenses/dist/isnot_lenses.wasm`; rebuild it with `sh packages/lenses/build-wasm.sh` after any lens change.
- JS: `pnpm test` and `pnpm check` from the repo root; `pnpm --filter web check` type-checks Svelte. New paraglide keys only type-check after `pnpm --filter web build` (or `dev`).
- No new npm or Go dependencies. Brand icon paths are copied inline.
- Never show an at-uri to users as a title or in running text.
- Commit messages describe what changed and why; never summarise test results in them.
- Follow `PRODUCT.md` and `DESIGN.md`: one signal colour (moss), flat, no second signal colour for warnings.
- Comments only where the code is counter-intuitive; tests are behavioural and concise.

---

### Task 1: Rename the rocksky MusicBrainz identifiers

**Files:**
- Modify: `packages/lenses/lenses/app.rocksky.song.json`
- Modify: `packages/lenses/lenses/app.rocksky.album.json`
- Modify: `packages/lenses/lenses/app.rocksky.artist.json`
- Modify: `packages/lenses/testdata/app.rocksky.song/angela.json`
- Modify: `packages/lenses/testdata/app.rocksky.song/why-try.json`
- Modify: `docs/creating-a-lens.md:118-130`
- Create: `.changeset/rocksky-musicbrainz-ids.md`

**Interfaces:**
- Produces: the song lens emits identifier key `musicbrainzRecordingId` (was `mbid`); album `musicbrainzReleaseId`; artist `musicbrainzArtistId`. Task 2's Go test and Task 5's link table rely on `musicbrainzRecordingId`.

- [ ] **Step 1: Change the fixtures first (they are the failing test)**

In both `packages/lenses/testdata/app.rocksky.song/angela.json` and `why-try.json`, change the expected identifier key `"mbid"` to `"musicbrainzRecordingId"`. Leave `input` untouched (the source record still says `mbid`). `why-try.json`'s expected identifiers become:

```json
"identifiers": [
  { "key": "musicbrainzRecordingId", "value": "e06593af-27be-4180-9952-c523921b544b" },
  { "key": "spotifyTrackId", "value": "7Ix78E0kjoC1WwAq8Yd7nX" }
]
```

The lens sorts identifiers by key, and `musicbrainzRecordingId` < `spotifyTrackId`, so the order stays.

- [ ] **Step 2: Run the Rust suite to see it fail**

Run: `cd packages/lenses && cargo test`
Expected: FAIL on the two `app.rocksky.song` fixtures with `mbid` vs `musicbrainzRecordingId`.

- [ ] **Step 3: Rename the keys in the three lens documents**

`app.rocksky.song.json` identifiers block:

```json
"identifiers": {
  "musicbrainzRecordingId": "mbid",
  "spotifyTrackId": { "field": "spotifyLink", "urlSegmentAfter": "track" }
}
```

`app.rocksky.album.json`:

```json
"identifiers": {
  "musicbrainzReleaseId": "mbid",
  "spotifyAlbumId": { "field": "spotifyLink", "urlSegmentAfter": "album" }
}
```

`app.rocksky.artist.json`:

```json
"extensions": {
  "at.isnot": { "identifiers": { "musicbrainzArtistId": "mbid" } }
},
```

- [ ] **Step 4: Rebuild and run all three suites**

Run: `cd packages/lenses && cargo test && sh build-wasm.sh && pnpm exec vp test --run && cd ../.. && go test ./...`
Expected: all PASS.

- [ ] **Step 5: Update the lens authoring doc**

In `docs/creating-a-lens.md`, the paragraph beginning "`identifiers` also takes a map" currently cites `lenses/app.rocksky.artist.json` uses `{"mbid": "mbid"}`. Change that citation to `{"musicbrainzArtistId": "mbid"}` and append this sentence to the paragraph:

```
Name the output key after what the id addresses, not what the source calls it —
`musicbrainzRecordingId`, not `mbid` — and add a row to `web/src/lib/identifierLinks.ts`
so the site can link it.
```

- [ ] **Step 6: Add the changeset and commit**

Create `.changeset/rocksky-musicbrainz-ids.md`:

```markdown
---
"@is-not/lenses": minor
---

Rocksky lenses name their MusicBrainz identifiers by what they address: `musicbrainzRecordingId`, `musicbrainzReleaseId`, `musicbrainzArtistId` instead of `mbid`.
```

```bash
git add packages/lenses/lenses packages/lenses/testdata docs/creating-a-lens.md .changeset/rocksky-musicbrainz-ids.md
git commit -m "feat(lenses): name rocksky MusicBrainz ids by what they address"
```

---

### Task 2: `subjects` table and lens run at ingest

**Files:**
- Create: `migrations/003_subjects.sql`
- Modify: `ingest.go` (struct at `:46-51`, `applyBatch` at `:69-97`, `applyCommit` at `:207-218`)
- Modify: `ingest_test.go` (`newTestIngester` at `:19-34`, `TestOpenDBMigratesOnceAndIsRepeatable` at `:169-201`, `identifiers` helper at `:349-366`, `TestFoldStoresSubjectFields` at `:368-405`, `TestFoldDeletingReviewRemovesTagsAndIdentifiers` at `:407-434`)

**Interfaces:**
- Consumes: `lenses.resolveSubject(ctx, uri, cid, record) (resolution, error)` and the `subject`/`identifier` structs from `lens.go`; the wasm rebuilt in Task 1.
- Produces: `ingester.lenses *lenses`, `ingester.fetchRecord func(ctx context.Context, uri string) (cid string, record map[string]any, err error)`, and `func (in *ingester) resolveAndStoreSubject(ctx, uri string) error` (used by Task 3's backfill). Table `subjects(uri, cid, title, type, resolved_at)` and `subject_identifiers(uri, key, value)`; `review_identifiers` is gone.

- [ ] **Step 1: Write the migration**

`migrations/003_subjects.sql`:

```sql
-- One row per reviewed subject, written by the ingester from a lens run over
-- the subject record itself. cid is the version the lens saw; a review's own
-- subject_cid says which version its opinion was about.
CREATE TABLE subjects (
  uri         TEXT PRIMARY KEY,
  cid         TEXT NOT NULL,
  title       TEXT NOT NULL,
  type        TEXT NOT NULL,
  resolved_at TEXT NOT NULL
);
CREATE TABLE subject_identifiers (
  uri   TEXT NOT NULL,
  key   TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (uri, key, value),
  FOREIGN KEY (uri) REFERENCES subjects (uri) ON DELETE CASCADE
);
CREATE INDEX subject_identifiers_lookup ON subject_identifiers (key, value);
-- Poster-supplied identifiers are never shown; the lens's live in subject_identifiers.
DROP TABLE review_identifiers;
```

- [ ] **Step 2: Update the schema test and the test ingester**

In `TestOpenDBMigratesOnceAndIsRepeatable`, replace the `review_identifiers` probe with:

```go
if _, err := db.Exec(`SELECT uri, cid, title, type, resolved_at FROM subjects`); err != nil {
	t.Fatal(err)
}
if _, err := db.Exec(`SELECT uri, key, value FROM subject_identifiers`); err != nil {
	t.Fatal(err)
}
```

Change `newTestIngester` to load the lenses and default to a fetch that fails, so every existing test runs the real code path with an unreachable subject:

```go
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
	ctx := context.Background()
	l, err := loadLenses(ctx)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { l.Close(ctx) })
	return &ingester{
		db: db, cat: cat, log: slog.New(slog.DiscardHandler), lenses: l,
		resolveHandle: func(context.Context, string) (string, error) { return "", nil },
		fetchRecord: func(context.Context, string) (string, map[string]any, error) {
			return "", nil, errors.New("no network in tests")
		},
	}
}
```

Replace the `identifiers` helper (it read `review_identifiers`) with one over the new table, and add a `storedSubject` helper:

```go
func subjectIdentifiers(t *testing.T, db *sql.DB, uri string) [][2]string {
	t.Helper()
	rs, err := db.Query(`SELECT key, value FROM subject_identifiers WHERE uri = ? ORDER BY key, value`, uri)
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

// storedSubject returns the subjects row for uri, or ok=false when there is none.
func storedSubject(t *testing.T, db *sql.DB, uri string) (s subject, ok bool) {
	t.Helper()
	err := db.QueryRow(`SELECT uri, cid, title, type FROM subjects WHERE uri = ?`, uri).Scan(&s.URI, &s.CID, &s.Title, &s.Type)
	if errors.Is(err, sql.ErrNoRows) {
		return s, false
	}
	if err != nil {
		t.Fatal(err)
	}
	return s, true
}
```

- [ ] **Step 3: Rewrite the two identifier tests as the new behaviour**

Replace `TestFoldStoresSubjectFields` and `TestFoldDeletingReviewRemovesTagsAndIdentifiers` with these. They read the rocksky fixture so the expected identifiers come from the lens's own contract, not a copy.

```go
// songFixture is a real rocksky song record and what the lens makes of it.
func songFixture(t *testing.T) (uri, cid string, record map[string]any, want subject) {
	t.Helper()
	data, err := os.ReadFile("packages/lenses/testdata/app.rocksky.song/why-try.json")
	if err != nil {
		t.Fatal(err)
	}
	var f struct {
		Input struct {
			URI    string         `json:"uri"`
			CID    string         `json:"cid"`
			Record map[string]any `json:"record"`
		} `json:"input"`
		Expected struct {
			Subject subject `json:"subject"`
		} `json:"expected"`
	}
	if err := json.Unmarshal(data, &f); err != nil {
		t.Fatal(err)
	}
	return f.Input.URI, f.Input.CID, f.Input.Record, f.Expected.Subject
}

func reviewOf(uri, cid string) map[string]any {
	record := reviewRecord(oneTag("x", int64(1)), defaultCreatedAt, defaultUpdatedAt)
	subject := record["subject"].(map[string]any)
	subject["uri"] = uri
	subject["cid"] = cid
	return record
}

func TestFoldLensesSubjectFromFetchedRecordNotThePoster(t *testing.T) {
	in := newTestIngester(t)
	uri, cid, record, want := songFixture(t)
	in.fetchRecord = func(_ context.Context, got string) (string, map[string]any, error) {
		if got != uri {
			t.Fatalf("fetched %q, want %q", got, uri)
		}
		return cid, record, nil
	}
	apply(t, in, 1, commitEvent("did:plc:a", "3k1", jetstream.OpCreate, reviewOf(uri, cid)))

	got, ok := storedSubject(t, in.db, uri)
	if !ok || got.Title != want.Title || got.Type != want.Type || got.CID != cid {
		t.Fatalf("subject = %+v, ok=%v; want %+v", got, ok, want)
	}
	var ids [][2]string
	for _, id := range want.Identifiers {
		ids = append(ids, [2]string{id.Key, id.Value})
	}
	if got := subjectIdentifiers(t, in.db, uri); !reflect.DeepEqual(got, ids) {
		t.Fatalf("identifiers = %v, want the lens's %v (never the poster's imdbId)", got, ids)
	}
	// The poster's own title stays on the review as the fallback.
	var title string
	if err := in.db.QueryRow(`SELECT subject_title FROM reviews WHERE rkey = '3k1'`).Scan(&title); err != nil {
		t.Fatal(err)
	}
	if title != "A Post" {
		t.Fatalf("review's own title = %q, want the poster's", title)
	}
}

func TestFoldStoresReviewWithoutSubjectWhenFetchFails(t *testing.T) {
	in := newTestIngester(t)
	uri, cid, _, _ := songFixture(t)
	apply(t, in, 1, commitEvent("did:plc:a", "3k1", jetstream.OpCreate, reviewOf(uri, cid)))
	if !reviewExists(t, in.db, "did:plc:a", "3k1") {
		t.Fatal("review missing after a failed subject fetch")
	}
	if _, ok := storedSubject(t, in.db, uri); ok {
		t.Fatal("a failed fetch must not write a subjects row")
	}
}

func TestFoldSkipsSubjectFetchForAKnownCid(t *testing.T) {
	in := newTestIngester(t)
	uri, cid, record, _ := songFixture(t)
	calls := 0
	in.fetchRecord = func(context.Context, string) (string, map[string]any, error) {
		calls++
		return cid, record, nil
	}
	apply(t, in, 1,
		commitEvent("did:plc:a", "3k1", jetstream.OpCreate, reviewOf(uri, cid)),
		commitEvent("did:plc:b", "3k1", jetstream.OpCreate, reviewOf(uri, cid)),
	)
	apply(t, in, 2, commitEvent("did:plc:c", "3k1", jetstream.OpCreate, reviewOf(uri, cid)))
	if calls != 1 {
		t.Fatalf("fetches = %d, want 1 (same cid, within and across batches)", calls)
	}
	apply(t, in, 3, commitEvent("did:plc:a", "3k1", jetstream.OpUpdate, reviewOf(uri, "bafyreidifferentcid")))
	if calls != 2 {
		t.Fatalf("fetches = %d, want 2 (a new cid refetches)", calls)
	}
}

func TestFoldWritesNoSubjectForUnsupportedCollection(t *testing.T) {
	in := newTestIngester(t)
	uri := "at://did:plc:subject/com.example.thing/3abc"
	in.fetchRecord = func(context.Context, string) (string, map[string]any, error) {
		return validCID, map[string]any{"$type": "com.example.thing", "name": "A Thing"}, nil
	}
	apply(t, in, 1, commitEvent("did:plc:a", "3k1", jetstream.OpCreate, reviewOf(uri, validCID)))
	if _, ok := storedSubject(t, in.db, uri); ok {
		t.Fatal("an unsupported collection must not write a subjects row")
	}
}

func TestFoldDeletingReviewRemovesTags(t *testing.T) {
	in := newTestIngester(t)
	apply(t, in, 1, commitEvent("did:plc:a", "3k1", jetstream.OpCreate, reviewRecord(oneTag("x", int64(1)), defaultCreatedAt, defaultUpdatedAt)))
	apply(t, in, 2, commitEvent("did:plc:a", "3k1", jetstream.OpDelete, nil))
	var tagCount int
	if err := in.db.QueryRow(`SELECT COUNT(*) FROM review_tags`).Scan(&tagCount); err != nil {
		t.Fatal(err)
	}
	if tagCount != 0 {
		t.Fatalf("review_tags = %d after delete, want 0", tagCount)
	}
}
```

Add `"encoding/json"`, `"os"` and `"reflect"` to `ingest_test.go`'s imports.

- [ ] **Step 4: Run the tests to see them fail**

Run: `go test ./... -run 'TestFold|TestOpenDB'`
Expected: compile failure (`ingester` has no `lenses`/`fetchRecord` fields, no `subject` scanning) — that is the failing state.

- [ ] **Step 5: Implement in `ingest.go`**

Add the two fields to `ingester`:

```go
type ingester struct {
	db            *sql.DB
	cat           *lexicon.Catalog
	log           *slog.Logger
	lenses        *lenses
	resolveHandle func(ctx context.Context, did string) (string, error)
	// fetchRecord reads a subject record from its author's PDS: the record's current cid and value.
	fetchRecord func(ctx context.Context, uri string) (cid string, record map[string]any, err error)
}
```

In `applyBatch`, after `resolveNewAccounts` and before `BeginTx`:

```go
	subjects, err := in.resolveSubjects(ctx, events)
	if err != nil {
		return err
	}
```

and inside the transaction, after the accounts loop and before the events loop:

```go
	for _, s := range subjects {
		if err := upsertSubject(tx, s, now); err != nil {
			return err
		}
	}
```

Add these functions:

```go
// resolveSubjects lenses the subject of every review created or updated in the batch,
// keyed by subject uri, skipping any whose record version is already stored. Network
// and lens failures are logged and skipped: the review still lands, on the poster's own
// title, and the next review naming that subject tries again.
func (in *ingester) resolveSubjects(ctx context.Context, events []jetstream.Event) (map[string]subject, error) {
	out := map[string]subject{}
	seen := map[string]bool{}
	for _, evt := range events {
		if evt.Kind != jetstream.KindCommit || evt.Commit.Collection != collection || evt.Commit.Operation == jetstream.OpDelete {
			continue
		}
		subj, _ := evt.Commit.Record["subject"].(map[string]any)
		uri, _ := subj["uri"].(string)
		cid, _ := subj["cid"].(string)
		if uri == "" || seen[uri] {
			continue
		}
		seen[uri] = true
		var known string
		err := in.db.QueryRowContext(ctx, `SELECT cid FROM subjects WHERE uri = ?`, uri).Scan(&known)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return nil, err
		}
		if err == nil && known == cid {
			continue
		}
		if s, ok := in.lensSubject(ctx, uri); ok {
			out[uri] = s
		}
	}
	return out, nil
}

// lensSubject fetches a subject record and runs the lenses over it. ok is false when
// the fetch fails, the lens errors, or no lens supports the collection.
func (in *ingester) lensSubject(ctx context.Context, uri string) (subject, bool) {
	fetchCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	cid, record, err := in.fetchRecord(fetchCtx, uri)
	cancel()
	if err != nil {
		in.log.Warn("subject fetch failed", "uri", uri, "err", err)
		return subject{}, false
	}
	res, err := in.lenses.resolveSubject(ctx, uri, cid, record)
	if err != nil || !res.Supported {
		in.log.Warn("subject not lensed", "uri", uri, "supported", res.Supported, "err", err)
		return subject{}, false
	}
	return res.Subject, true
}

// resolveAndStoreSubject lenses one subject and writes it in its own transaction.
// The startup backfill uses it for subjects reviewed before subjects existed.
func (in *ingester) resolveAndStoreSubject(ctx context.Context, uri string) error {
	s, ok := in.lensSubject(ctx, uri)
	if !ok {
		return nil
	}
	tx, err := in.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := upsertSubject(tx, s, time.Now().UTC().Format(atmos.AtprotoDatetimeLayout)); err != nil {
		return err
	}
	return tx.Commit()
}

func upsertSubject(tx *sql.Tx, s subject, now string) error {
	if _, err := tx.Exec(`
		INSERT INTO subjects (uri, cid, title, type, resolved_at) VALUES (?, ?, ?, ?, ?)
		ON CONFLICT (uri) DO UPDATE SET
			cid = excluded.cid, title = excluded.title, type = excluded.type, resolved_at = excluded.resolved_at`,
		s.URI, s.CID, s.Title, s.Type, now); err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM subject_identifiers WHERE uri = ?`, s.URI); err != nil {
		return err
	}
	for _, id := range s.Identifiers {
		if _, err := tx.Exec(`INSERT OR IGNORE INTO subject_identifiers (uri, key, value) VALUES (?, ?, ?)`, s.URI, id.Key, id.Value); err != nil {
			return err
		}
	}
	return nil
}
```

In `applyCommit`, delete the block from `if _, err := tx.Exec(`DELETE FROM review_identifiers ...` through the end of the `if ids, ok := subject["identifiers"]` loop (lines 207-218), leaving `return nil`.

- [ ] **Step 6: Run the tests**

Run: `go test ./...`
Expected: PASS. (`main.go` does not compile yet if it references removed things; it does not, so the build is fine.)

- [ ] **Step 7: Commit**

```bash
git add migrations/003_subjects.sql ingest.go ingest_test.go
git commit -m "feat(ingest): lens each subject from its own record into a subjects table

The poster's identifiers are no longer stored; title and type stay on the
review only as the fallback when the subject could not be lensed."
```

---

### Task 3: PDS record fetcher, wiring and startup backfill

**Files:**
- Create: `fetch.go`
- Create: `fetch_test.go`
- Modify: `main.go:63` (ingester construction) and the goroutines below it

**Interfaces:**
- Consumes: `ingester.fetchRecord`, `ingester.lenses`, `ingester.resolveAndStoreSubject` from Task 2; `loadLenses` from `lens.go`; `identity.Directory` from atmos.
- Produces: `recordFetcher(pdsFor func(ctx context.Context, did string) (string, error), client *http.Client) func(ctx context.Context, uri string) (string, map[string]any, error)`; `pdsResolver() func(ctx context.Context, did string) (string, error)`; `func (in *ingester) backfillSubjects(ctx context.Context)`.

- [ ] **Step 1: Write the fetcher tests**

`fetch_test.go`:

```go
package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func fetcherAgainst(t *testing.T, handler http.HandlerFunc) func(ctx context.Context, uri string) (string, map[string]any, error) {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	return recordFetcher(func(context.Context, string) (string, error) { return srv.URL, nil }, srv.Client())
}

func TestRecordFetcherReturnsCidAndValue(t *testing.T) {
	fetch := fetcherAgainst(t, func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		if r.URL.Path != "/xrpc/com.atproto.repo.getRecord" || q.Get("repo") != "did:plc:x" || q.Get("collection") != "app.rocksky.song" || q.Get("rkey") != "3abc" {
			t.Errorf("unexpected request %s", r.URL)
		}
		w.Write([]byte(`{"uri":"at://did:plc:x/app.rocksky.song/3abc","cid":"bafycid","value":{"$type":"app.rocksky.song","title":"Angela"}}`))
	})
	cid, record, err := fetch(context.Background(), "at://did:plc:x/app.rocksky.song/3abc")
	if err != nil || cid != "bafycid" || record["title"] != "Angela" {
		t.Fatalf("got %q %v %v", cid, record, err)
	}
}

func TestRecordFetcherRejectsMissingRecordsAndHugeBodies(t *testing.T) {
	notFound := fetcherAgainst(t, func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusBadRequest) })
	if _, _, err := notFound(context.Background(), "at://did:plc:x/app.rocksky.song/3abc"); err == nil {
		t.Fatal("want an error for a non-200 response")
	}
	huge := fetcherAgainst(t, func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"cid":"bafycid","value":{"pad":"` + strings.Repeat("x", maxRecordBytes) + `"}}`))
	})
	if _, _, err := huge(context.Background(), "at://did:plc:x/app.rocksky.song/3abc"); err == nil {
		t.Fatal("want an error for a body over the limit")
	}
	if _, _, err := notFound(context.Background(), "not a uri"); err == nil {
		t.Fatal("want an error for a malformed uri")
	}
}
```

- [ ] **Step 2: Run to see it fail**

Run: `go test ./... -run TestRecordFetcher`
Expected: compile error, `recordFetcher` and `maxRecordBytes` undefined.

- [ ] **Step 3: Implement `fetch.go`**

```go
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/jcalabro/atmos"
	"github.com/jcalabro/atmos/identity"
)

// A subject record bigger than this never reaches the wasm allocator.
const maxRecordBytes = 1 << 20

// pdsResolver maps a DID to its PDS endpoint via its DID document. Handle
// verification is skipped: only the service endpoint matters here.
func pdsResolver() func(ctx context.Context, did string) (string, error) {
	dir := &identity.Directory{
		Resolver:               &identity.DefaultResolver{},
		Cache:                  identity.NewLRUCache(10_000, time.Hour),
		SkipHandleVerification: true,
	}
	return func(ctx context.Context, did string) (string, error) {
		id, err := dir.LookupDID(ctx, atmos.DID(did))
		if err != nil {
			return "", err
		}
		if id.PDSEndpoint() == "" {
			return "", errors.New("no PDS in DID document")
		}
		return id.PDSEndpoint(), nil
	}
}

// recordFetcher reads a record from its author's PDS with com.atproto.repo.getRecord.
func recordFetcher(pdsFor func(ctx context.Context, did string) (string, error), client *http.Client) func(ctx context.Context, uri string) (string, map[string]any, error) {
	return func(ctx context.Context, uri string) (string, map[string]any, error) {
		if _, err := atmos.ParseATURI(uri); err != nil {
			return "", nil, err
		}
		parts := strings.SplitN(strings.TrimPrefix(uri, "at://"), "/", 3)
		if len(parts) != 3 {
			return "", nil, fmt.Errorf("not a record uri: %s", uri)
		}
		pds, err := pdsFor(ctx, parts[0])
		if err != nil {
			return "", nil, err
		}
		q := url.Values{"repo": {parts[0]}, "collection": {parts[1]}, "rkey": {parts[2]}}
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, pds+"/xrpc/com.atproto.repo.getRecord?"+q.Encode(), nil)
		if err != nil {
			return "", nil, err
		}
		resp, err := client.Do(req)
		if err != nil {
			return "", nil, err
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			return "", nil, fmt.Errorf("getRecord %s: %s", uri, resp.Status)
		}
		body, err := io.ReadAll(io.LimitReader(resp.Body, maxRecordBytes+1))
		if err != nil {
			return "", nil, err
		}
		if len(body) > maxRecordBytes {
			return "", nil, fmt.Errorf("getRecord %s: record over %d bytes", uri, maxRecordBytes)
		}
		var out struct {
			CID   string         `json:"cid"`
			Value map[string]any `json:"value"`
		}
		if err := json.Unmarshal(body, &out); err != nil {
			return "", nil, err
		}
		if out.CID == "" || out.Value == nil {
			return "", nil, fmt.Errorf("getRecord %s: no cid or value", uri)
		}
		return out.CID, out.Value, nil
	}
}
```

- [ ] **Step 4: Run the fetcher tests**

Run: `go test ./... -run TestRecordFetcher`
Expected: PASS.

- [ ] **Step 5: Add the backfill to `ingest.go` and wire `main.go`**

Append to `ingest.go`:

```go
// backfillSubjects lenses every subject reviewed before the subjects table existed.
// It runs once at startup, one subject at a time, and is a no-op thereafter.
func (in *ingester) backfillSubjects(ctx context.Context) {
	rows, err := in.db.QueryContext(ctx, `SELECT DISTINCT subject_uri FROM reviews r WHERE NOT EXISTS (SELECT 1 FROM subjects s WHERE s.uri = r.subject_uri)`)
	if err != nil {
		in.log.Warn("subject backfill query failed", "err", err)
		return
	}
	var uris []string
	for rows.Next() {
		var uri string
		if err := rows.Scan(&uri); err == nil {
			uris = append(uris, uri)
		}
	}
	rows.Close()
	for _, uri := range uris {
		if ctx.Err() != nil {
			return
		}
		if err := in.resolveAndStoreSubject(ctx, uri); err != nil {
			in.log.Warn("subject backfill write failed", "uri", uri, "err", err)
		}
	}
	if len(uris) > 0 {
		in.log.Info("subject backfill done", "subjects", len(uris))
	}
}
```

(The uris are collected before any write so the single connection is not held open by a cursor while `resolveAndStoreSubject` needs it.)

In `main.go`'s `run`, after `cat, err := loadCatalog()` succeeds, load the lenses:

```go
	lens, err := loadLenses(ctx)
	if err != nil {
		return err
	}
	defer lens.Close(ctx)
```

Replace the ingester construction with:

```go
	in := &ingester{
		db: db, cat: cat, log: log, lenses: lens,
		resolveHandle: handleResolver(),
		fetchRecord:   recordFetcher(pdsResolver(), &http.Client{Timeout: 10 * time.Second}),
	}
```

and just before the `errs` goroutines add `go in.backfillSubjects(runCtx)`. Add `"net/http"` to `main.go`'s imports.

- [ ] **Step 6: Build and run everything**

Run: `go vet ./... && go test ./...`
Expected: PASS, no vet complaints.

- [ ] **Step 7: Commit**

```bash
git add fetch.go fetch_test.go ingest.go main.go
git commit -m "feat(ingest): fetch subject records from their PDS and backfill existing subjects"
```

---

### Task 4: Site reads resolved subjects

**Files:**
- Modify: `web/src/lib/server/db.ts` (`ListedReview` at `:82-91`, `listReviews` at `:130-186`, `listReviewsPage` at `:230-303`, `subjectTypesFor` at `:306-315`)
- Modify: `web/src/lib/server/db.test.ts` (`beforeAll` seed at `:14-73`, `listReviews` block at `:145-181`)
- Modify: `web/src/lib/server/liveReview.ts:24-40` (`toListedReview`)

**Interfaces:**
- Consumes: tables from Task 2.
- Produces: `ListedReview.subject: Subject` (from `@is-not/lenses`, with optional `identifiers`) and `ListedReview.stale: boolean`. Tasks 5 and 6 read `review.subject.identifiers` and `review.stale`.

- [ ] **Step 1: Seed a `subjects` row and write the failing tests**

In `db.test.ts`'s `beforeAll`, after the tag inserts and before `setup.close()`:

```ts
  setup
    .prepare('INSERT INTO subjects (uri, cid, title, type, resolved_at) VALUES (?, ?, ?, ?, ?)')
    .run('at://did:plc:x/app.bsky.feed.post/1', 'bafy1-newer', 'A Sandwich', 'meal', when);
  const identifier = setup.prepare(
    'INSERT INTO subject_identifiers (uri, key, value) VALUES (?, ?, ?)',
  );
  identifier.run('at://did:plc:x/app.bsky.feed.post/1', 'isbn13', '9780000000002');
  identifier.run('at://did:plc:x/app.bsky.feed.post/1', 'goodreadsId', '42');
```

Existing assertions that look for the title `'a sandwich'` and type `'post'` for that subject now see `'A Sandwich'`/`'meal'`; update them: in `randomSentences`'s first test, `known?.subject` becomes

```ts
    expect(known?.subject).toEqual({
      uri: 'at://did:plc:x/app.bsky.feed.post/1',
      cid: 'bafy1',
      title: 'A Sandwich',
      type: 'meal',
    });
```

and in `listReviews`, `['a rock', 'a sandwich']` becomes `['A Sandwich', 'a rock']`, `r.subject.title === 'a sandwich'` becomes `'A Sandwich'`, `{ type: 'post' }` count becomes `1`. `subjectTypesFor` expects `['meal', 'post']`.

Add to the `listReviews` describe block:

```ts
  it('shows the lensed subject, its identifiers, and whether the review predates it', async () => {
    const { listReviews } = await import('./db');
    const lensed = listReviews({ subjectUri: 'at://did:plc:x/app.bsky.feed.post/1' });
    expect(lensed.every((r) => r.subject.title === 'A Sandwich' && r.subject.type === 'meal')).toBe(true);
    expect(lensed[0].subject.identifiers).toEqual([
      { key: 'goodreadsId', value: '42' },
      { key: 'isbn13', value: '9780000000002' },
    ]);
    // The review's own cid (bafy1) is older than the version lensed (bafy1-newer).
    expect(lensed.every((r) => r.stale)).toBe(true);

    const [unlensed] = listReviews({ subjectUri: 'at://did:plc:x/app.bsky.feed.post/3' });
    expect(unlensed.subject.title).toBe('a chair');
    expect(unlensed.subject.identifiers).toBeUndefined();
    expect(unlensed.stale).toBe(false);
  });

  it('filters by the lensed type, not the poster’s', async () => {
    const { listReviews } = await import('./db');
    expect(listReviews({ subjectUri: 'at://did:plc:x/app.bsky.feed.post/1' }, { type: 'post' })).toEqual([]);
    expect(listReviews({ subjectUri: 'at://did:plc:x/app.bsky.feed.post/1' }, { type: 'meal' })).toHaveLength(2);
  });
```

Add the same identifiers/stale expectation for `listReviewsPage` in `db.pagination.test.ts` only if that file seeds its own DB with a subject; otherwise leave it (the two functions share the row mapper written below).

- [ ] **Step 2: Run to see them fail**

Run: `pnpm --filter web test -- db.test.ts`
Expected: FAIL: titles still lowercase, `identifiers` and `stale` undefined.

- [ ] **Step 3: Implement in `db.ts`**

Import the type: `import type { Subject } from '@is-not/lenses';` (keep the existing `Direction, Tag` import from `@is-not/sentence`).

Change `ListedReview`:

```ts
export type ListedReview = {
  did: string;
  handle: string;
  rkey: string;
  subject: Subject;
  tags: Tag[];
  locale?: string;
  createdAt: string;
  updatedAt: string;
  /** The review named an older version of the subject than the one lensed. */
  stale: boolean;
};
```

Add shared SQL fragments and a row mapper above `listReviews`:

```ts
/** The subject as the lens saw it, falling back to what the poster wrote. `r` is
    the reviews alias; the caller joins `subjects s`. */
const SUBJECT_COLUMNS = `
  r.subject_uri, r.subject_cid,
  COALESCE(s.title, r.subject_title) AS subject_title,
  COALESCE(s.type, r.subject_type) AS subject_type,
  s.cid AS resolved_cid,
  (SELECT json_group_array(json_object('key', i.key, 'value', i.value))
     FROM (SELECT key, value FROM subject_identifiers WHERE uri = r.subject_uri ORDER BY key, value) i) AS identifiers`;
const SUBJECT_JOIN = 'LEFT JOIN subjects s ON s.uri = r.subject_uri';
const TYPE_FILTER = 'COALESCE(s.type, r.subject_type) = ?';

type SubjectRow = {
  subject_uri: string;
  subject_cid: string;
  subject_title: string;
  subject_type: string;
  resolved_cid: string | null;
  identifiers: string;
};

function rowSubject(row: SubjectRow): { subject: Subject; stale: boolean } {
  const identifiers = JSON.parse(row.identifiers) as Subject['identifiers'];
  return {
    subject: {
      uri: row.subject_uri,
      cid: row.subject_cid,
      title: row.subject_title,
      type: row.subject_type,
      ...(identifiers?.length ? { identifiers } : {}),
    },
    stale: row.resolved_cid !== null && row.resolved_cid !== row.subject_cid,
  };
}
```

Change `ListRow` to extend it: `type ListRow = SubjectRow & { did; handle; rkey; locale; created_at; updated_at; adjective; direction }` (keep the existing field types).

In `listReviews`: the type condition becomes `conditions.push(TYPE_FILTER)`; the SELECT becomes

```ts
      `SELECT r.did, COALESCE(a.handle, '') AS handle, r.rkey, ${SUBJECT_COLUMNS},
              r.locale, r.created_at, r.updated_at, t.adjective, t.direction
       FROM reviews r
       ${SUBJECT_JOIN}
       JOIN review_tags t ON t.did = r.did AND t.rkey = r.rkey
       LEFT JOIN accounts a ON a.did = r.did
       WHERE ${conditions.join(' AND ')}
       ORDER BY r.updated_at DESC, r.did, r.rkey, t.adjective`
```

and the review construction becomes

```ts
      review = {
        did: row.did,
        handle: row.handle,
        rkey: row.rkey,
        ...rowSubject(row),
        tags: [],
        locale: row.locale || undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
```

In `listReviewsPage`: the inner subquery filters on the coalesced type, so it needs the join too. The type condition becomes `conditions.push(TYPE_FILTER)` and the SQL:

```ts
      `SELECT r.did, r.rkey, COALESCE(a.handle, '') AS handle, ${SUBJECT_COLUMNS},
              r.locale, r.created_at, r.updated_at, t.adjective, t.direction
       FROM (
         SELECT r.* FROM reviews r
         ${SUBJECT_JOIN}
         WHERE ${conditions.join(' AND ')}
         ORDER BY r.updated_at DESC, r.did DESC, r.rkey DESC
         LIMIT ?
       ) r
       ${SUBJECT_JOIN}
       LEFT JOIN accounts a ON a.did = r.did
       JOIN review_tags t ON t.did = r.did AND t.rkey = r.rkey
       ORDER BY r.updated_at DESC, r.did DESC, r.rkey DESC, t.adjective`
```

(the page subquery is now aliased `r`, not `sub`, so the shared fragments apply) with the same `...rowSubject(row)` construction.

In `subjectTypesFor`:

```ts
      `SELECT DISTINCT COALESCE(s.type, r.subject_type) AS subject_type
       FROM reviews r ${SUBJECT_JOIN} WHERE ${scoped.sql} ORDER BY subject_type`,
```

`randomSentences` keeps its own `HomeReview` shape but should show the lensed title too: add `${SUBJECT_JOIN}` after its `JOIN reviews r ...` line and replace `r.subject_title, r.subject_type` in its SELECT with `COALESCE(s.title, r.subject_title) AS subject_title, COALESCE(s.type, r.subject_type) AS subject_type`.

In `liveReview.ts`'s `toListedReview`, add `stale: false,` to the returned object (a live read has no `subjects` row to compare with).

- [ ] **Step 4: Run the web tests and type check**

Run: `pnpm --filter web test && pnpm --filter web check`
Expected: PASS; `svelte-check` reports 0 errors. If `check` complains that `ListedReview` objects elsewhere lack `stale` (search `web/src` for `: ListedReview = {` or `as ListedReview`), add `stale: false` there.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/server/db.ts web/src/lib/server/db.test.ts web/src/lib/server/liveReview.ts
git commit -m "feat(web): read subjects as the lens saw them, with identifiers and a stale flag"
```

---

### Task 5: Identifier link table

**Files:**
- Create: `web/src/lib/identifierLinks.ts`
- Create: `web/src/lib/identifierLinks.test.ts`

**Interfaces:**
- Consumes: `Subject` from `@is-not/lenses`.
- Produces: `export type Brand = 'spotify' | 'musicbrainz' | 'imdb' | 'tmdb' | 'openlibrary' | 'goodreads' | 'bookhive' | 'steam' | 'amazon'`; `export type Link = { href: string; brand: Brand; site: string }`; `export function identifierLinks(subject: Pick<Subject, 'type' | 'identifiers'>): Link[]`; `export const BRAND_SITES: Record<Brand, string>`.

- [ ] **Step 1: Write the failing test**

`web/src/lib/identifierLinks.test.ts`:

```ts
import { describe, expect, it } from 'vite-plus/test';
import { identifierLinks } from './identifierLinks';

const ids = (...pairs: [string, string][]) => pairs.map(([key, value]) => ({ key, value }));

describe('identifierLinks', () => {
  it('links a rocksky song to Spotify and MusicBrainz, in table order', () => {
    const links = identifierLinks({
      type: 'music-track',
      identifiers: ids(
        ['musicbrainzRecordingId', '1e4bfb4b-2fe5-469d-986d-f6c0adb11a44'],
        ['spotifyTrackId', '5lE2EFXt4muvLFMGQg4hZN'],
      ),
    });
    expect(links).toEqual([
      { href: 'https://open.spotify.com/track/5lE2EFXt4muvLFMGQg4hZN', brand: 'spotify', site: 'Spotify' },
      {
        href: 'https://musicbrainz.org/recording/1e4bfb4b-2fe5-469d-986d-f6c0adb11a44',
        brand: 'musicbrainz',
        site: 'MusicBrainz',
      },
    ]);
  });

  it('sends a tmdbId to the tv or movie page by subject type', () => {
    const tv = identifierLinks({ type: 'tv-show', identifiers: ids(['tmdbId', '95396']) });
    const film = identifierLinks({ type: 'movie', identifiers: ids(['tmdbId', '575265']) });
    expect(tv[0].href).toBe('https://www.themoviedb.org/tv/95396');
    expect(film[0].href).toBe('https://www.themoviedb.org/movie/575265');
  });

  it('makes one Open Library link, preferring isbn13', () => {
    const both = identifierLinks({
      type: 'book',
      identifiers: ids(['isbn10', '0765378000'], ['isbn13', '9780765378002']),
    });
    expect(both.map((l) => l.href)).toEqual(['https://openlibrary.org/isbn/9780765378002']);
    const only10 = identifierLinks({ type: 'book', identifiers: ids(['isbn10', '0765378000']) });
    expect(only10.map((l) => l.href)).toEqual(['https://openlibrary.org/isbn/0765378000']);
  });

  it('ignores keys with no public page and encodes values', () => {
    expect(
      identifierLinks({
        type: 'video-game',
        identifiers: ids(['igdb', '406928'], ['externalId', '42'], ['steam', '46 59']),
      }),
    ).toEqual([{ href: 'https://store.steampowered.com/app/46%2059', brand: 'steam', site: 'Steam' }]);
    expect(identifierLinks({ type: 'post' })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm --filter web test -- identifierLinks`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`web/src/lib/identifierLinks.ts`:

```ts
import type { Subject } from '@is-not/lenses';

export type Brand =
  | 'spotify'
  | 'musicbrainz'
  | 'imdb'
  | 'tmdb'
  | 'openlibrary'
  | 'goodreads'
  | 'bookhive'
  | 'steam'
  | 'amazon';

export const BRAND_SITES: Record<Brand, string> = {
  spotify: 'Spotify',
  musicbrainz: 'MusicBrainz',
  imdb: 'IMDb',
  tmdb: 'TMDB',
  openlibrary: 'Open Library',
  goodreads: 'Goodreads',
  bookhive: 'Bookhive',
  steam: 'Steam',
  amazon: 'Amazon',
};

export type Link = { href: string; brand: Brand; site: string };

type Rule = { keys: string[]; brand: Brand; url: (value: string, type: string) => string };

// One row per public page an identifier can address, in display order. Keys with
// no id-addressable page (igdb, externalId, other, parentMbReleaseId) have no row.
const RULES: Rule[] = [
  { keys: ['spotifyTrackId'], brand: 'spotify', url: (v) => `https://open.spotify.com/track/${v}` },
  { keys: ['spotifyAlbumId'], brand: 'spotify', url: (v) => `https://open.spotify.com/album/${v}` },
  { keys: ['musicbrainzRecordingId'], brand: 'musicbrainz', url: (v) => `https://musicbrainz.org/recording/${v}` },
  { keys: ['musicbrainzReleaseId', 'mbReleaseId'], brand: 'musicbrainz', url: (v) => `https://musicbrainz.org/release/${v}` },
  { keys: ['musicbrainzArtistId'], brand: 'musicbrainz', url: (v) => `https://musicbrainz.org/artist/${v}` },
  { keys: ['imdbId'], brand: 'imdb', url: (v) => `https://www.imdb.com/title/${v}` },
  {
    keys: ['tmdbId'],
    brand: 'tmdb',
    url: (v, type) => `https://www.themoviedb.org/${type.startsWith('tv-') ? 'tv' : 'movie'}/${v}`,
  },
  { keys: ['tmdbTvSeriesId'], brand: 'tmdb', url: (v) => `https://www.themoviedb.org/tv/${v}` },
  { keys: ['isbn13', 'isbn10'], brand: 'openlibrary', url: (v) => `https://openlibrary.org/isbn/${v}` },
  { keys: ['goodreadsId'], brand: 'goodreads', url: (v) => `https://www.goodreads.com/book/show/${v}` },
  { keys: ['hiveId'], brand: 'bookhive', url: (v) => `https://bookhive.buzz/books/${v}` },
  { keys: ['steam'], brand: 'steam', url: (v) => `https://store.steampowered.com/app/${v}` },
  { keys: ['asin'], brand: 'amazon', url: (v) => `https://www.amazon.com/dp/${v}` },
];

/** Public pages for a subject, one per rule, from its lens-derived identifiers.
    A rule listing several keys takes the first one present, so isbn13 beats isbn10. */
export function identifierLinks(subject: Pick<Subject, 'type' | 'identifiers'>): Link[] {
  const values = new Map((subject.identifiers ?? []).map((id) => [id.key, id.value]));
  const links: Link[] = [];
  for (const rule of RULES) {
    const key = rule.keys.find((k) => values.has(k));
    if (key === undefined) continue;
    links.push({
      href: rule.url(encodeURIComponent(values.get(key)!), subject.type),
      brand: rule.brand,
      site: BRAND_SITES[rule.brand],
    });
  }
  return links;
}
```

- [ ] **Step 4: Run the test and lint**

Run: `pnpm --filter web test -- identifierLinks && pnpm check`
Expected: PASS, no lint or format complaints (run `pnpm exec vp fmt` if oxfmt wants a reflow).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/identifierLinks.ts web/src/lib/identifierLinks.test.ts
git commit -m "feat(web): map lens identifiers to their public pages"
```

---

### Task 6: Brand icons, subject links and the earlier-version note

**Files:**
- Create: `web/src/lib/BrandIcon.svelte`
- Create: `web/src/lib/SubjectLinks.svelte`
- Modify: `web/messages/en.json` (append keys)
- Modify: `web/src/lib/SingleReview.svelte`
- Modify: `web/src/routes/reviews/[...id]/+page.server.ts:126-153` (subject listing branch)
- Modify: `web/src/routes/reviews/[...id]/+page.svelte:97-100` (the `<h1>` block)
- Modify: `web/src/lib/ReviewRow.svelte:139-150` (`.meta` span) and its `<style>`

**Interfaces:**
- Consumes: `identifierLinks`, `Brand`, `Link` from Task 5; `ListedReview.subject.identifiers` and `.stale` from Task 4.
- Produces: `<SubjectLinks subject={Subject} />`, `<BrandIcon brand={Brand} />`; paraglide keys `open_on` (`{site}`), `subject_links`, `review_earlier_version`; the listing branch's load returns `subject: Subject | null`.

- [ ] **Step 1: Add the messages**

Append to `web/messages/en.json` (inside the object, keeping valid JSON):

```json
  "subject_links": "Find it elsewhere",
  "open_on": "Open on {site}",
  "review_earlier_version": "This review was of an earlier version of the subject"
```

Run `pnpm --filter web build` once so the paraglide output has the new keys (the build may fail later on Svelte errors until the components exist; the paraglide step comes first and its output is what matters here).

- [ ] **Step 2: `BrandIcon.svelte`**

Fetch each path with `curl -s https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/<slug>.svg` for slugs `spotify`, `musicbrainz`, `imdb`, `themoviedatabase`, `goodreads`, `steam`, `amazon`, and copy the `d` attribute of each `<path>` into the map below. Brand colours are Simple Icons' documented hex for each (`spotify` 1DB954, `musicbrainz` BA478F, `imdb` F5C518, `themoviedatabase` 01B4E4, `goodreads` 372213, `steam` 000000, `amazon` FF9900). Open Library and Bookhive have no Simple Icon; they use a generic glyph in ink.

```svelte
<script lang="ts">
  import type { Brand } from '$lib/identifierLinks';

  let { brand }: { brand: Brand } = $props();

  // Simple Icons paths (CC0), 24x24 viewBox. Colours are each brand's own; the
  // ones that vanish on the dark ground get a light-dark() pair.
  const ICONS: Record<Brand, { path: string; color: string }> = {
    spotify: { path: '<paste>', color: '#1db954' },
    musicbrainz: { path: '<paste>', color: '#ba478f' },
    imdb: { path: '<paste>', color: '#f5c518' },
    tmdb: { path: '<paste>', color: '#01b4e4' },
    goodreads: { path: '<paste>', color: 'light-dark(#372213, #e9ddcf)' },
    steam: { path: '<paste>', color: 'light-dark(#000000, #ffffff)' },
    amazon: { path: '<paste>', color: '#ff9900' },
    // No brand mark: a plain open book, in ink.
    openlibrary: {
      path: 'M12 6.5C10.5 5 8.5 4.5 6 4.5H3v13h3c2.5 0 4.5.5 6 2 1.5-1.5 3.5-2 6-2h3v-13h-3c-2.5 0-4.5.5-6 2zm0 0v13',
      color: 'currentColor',
    },
    // No brand mark: a hexagon cell, in ink.
    bookhive: { path: 'M12 2l8.66 5v10L12 22l-8.66-5V7z', color: 'currentColor' },
  };
  const icon = $derived(ICONS[brand]);
</script>

<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" style:color={icon.color}>
  <path d={icon.path} fill={icon.color === 'currentColor' ? 'none' : 'currentColor'} stroke={icon.color === 'currentColor' ? 'currentColor' : 'none'} stroke-width="1.6" stroke-linejoin="round" />
</svg>

<style>
  svg {
    display: block;
  }
</style>
```

Replace every `'<paste>'` with the real path data. Do not leave a placeholder.

- [ ] **Step 3: `SubjectLinks.svelte`**

```svelte
<script lang="ts">
  import type { Subject } from '@is-not/lenses';
  import { m } from '$lib/paraglide/messages.js';
  import BrandIcon from '$lib/BrandIcon.svelte';
  import { identifierLinks } from '$lib/identifierLinks';

  let { subject }: { subject: Subject } = $props();
  const links = $derived(identifierLinks(subject));
</script>

{#if links.length > 0}
  <ul class="links" aria-label={m.subject_links()}>
    {#each links as link (link.href)}
      <li>
        <a href={link.href} rel="external" aria-label={m.open_on({ site: link.site })} title={m.open_on({ site: link.site })}>
          <BrandIcon brand={link.brand} />
        </a>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .links {
    list-style: none;
    margin: 0;
    padding: 0;
    display: inline-flex;
    gap: var(--space-3);
  }

  a {
    display: block;
    padding: var(--space-1);
    color: var(--ink);
    line-height: 0;
    opacity: 0.85;
  }

  @media (hover: hover) {
    a:hover {
      opacity: 1;
    }
  }
</style>
```

- [ ] **Step 4: Single review page: links and the earlier-version note**

In `SingleReview.svelte`, add `import SubjectLinks from '$lib/SubjectLinks.svelte';`, add `stale: boolean;` to the `review` prop type, and change the hero's children to:

```svelte
<SentenceHero title={heading} {parts} animate={!prefersReducedMotion.current}>
  <a class="pill" href={`/review?subject=${encodeURIComponent(review.subject.uri)}`}>
    {m.review_it_yourself()}
  </a>
  <SubjectLinks subject={review.subject} />
  {#if review.stale}
    <p class="stale">
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3 2 21h20zM12 10v5m0 3v.5" /></svg>
      {m.review_earlier_version()}
    </p>
  {/if}
</SentenceHero>

<style>
  .stale {
    flex-basis: 100%;
    margin: 0;
    display: inline-flex;
    justify-content: center;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--step--1);
    color: var(--ink-soft);
  }
  .stale svg {
    display: block;
  }
</style>
```

(`.actions` in `SentenceHero` is a wrapping flex row, so the full-width `.stale` drops to its own line under the pill and links.)

- [ ] **Step 5: Subject listing page: links under the title**

In `+page.server.ts`'s subject branch (the `listReviews({ subjectUri: id })` block), add `subject: allReviews[0]?.subject ?? null,` to the returned object. In the other two listing branches (`id === ''` and the per-person branch) add `subject: null,` so the shape is uniform.

In `+page.svelte`, add `import SubjectLinks from '$lib/SubjectLinks.svelte';` and change the `<h1>` block to:

```svelte
    <h1 class="display" class:unresolved>
      {heading}
      {#if subjectType}<small>({subjectType.replaceAll('-', ' ')})</small>{/if}
    </h1>
    {#if listing.subject}<div class="subject-links"><SubjectLinks subject={listing.subject} /></div>{/if}
```

and in its `<style>` add:

```css
  .subject-links {
    display: flex;
    justify-content: center;
    margin-block: calc(-1 * var(--space-3)) var(--space-5);
  }
```

(Adjust the negative top margin to sit the row just under the heading; check it against the heading's existing bottom margin in that file's styles.)

- [ ] **Step 6: Row glyph**

In `ReviewRow.svelte`'s `.meta` span, before the permalink anchor:

```svelte
    {#if review.stale}
      <span class="stale" role="img" aria-label={m.review_earlier_version()} title={m.review_earlier_version()}>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3 2 21h20zM12 10v5m0 3v.5" /></svg>
      </span>
    {/if}
```

and in the style block, next to `.permalink`:

```css
  .stale {
    color: var(--ink-soft);
    line-height: 0;
  }
  .stale svg {
    display: block;
  }
```

- [ ] **Step 7: Build, check, test**

Run: `pnpm --filter web build && pnpm --filter web check && pnpm test && pnpm check`
Expected: build succeeds, 0 svelte-check errors, tests pass, lint clean.

- [ ] **Step 8: Look at it**

Run the site against a database with a lensed subject (`go run .` in one terminal with `DATABASE_PATH`, `pnpm --filter web dev` in another), open `/reviews/at://<did>/app.rocksky.song/<rkey>` and a single review's page, and confirm: icons render in brand colour in both colour schemes, each link opens the right page, and a review whose cid differs shows the note. If a Gecko check is convenient use the Zen headless screenshot command from CLAUDE.md.

- [ ] **Step 9: Commit**

```bash
git add web/messages/en.json web/src/lib/BrandIcon.svelte web/src/lib/SubjectLinks.svelte web/src/lib/SingleReview.svelte web/src/lib/ReviewRow.svelte 'web/src/routes/reviews/[...id]/+page.server.ts' 'web/src/routes/reviews/[...id]/+page.svelte'
git commit -m "feat(web): link a subject to its public pages and mark reviews of an earlier version"
```

---

### Task 7: Docs and bean

**Files:**
- Modify: `README.md:11-12`
- Modify: `CLAUDE.md` ("Things that cost time")
- Modify: bean ISNOT-x4bn via `beans`

- [ ] **Step 1: README**

Change the API bullet's table list to `(`reviews`, `review_tags`, `subjects`, `subject_identifiers`, `accounts`, `cursor`)` and add one sentence after it: "Each review's subject is fetched from its author's PDS and run through the lenses; `subjects` holds what the lens saw, and a review's own title is only the fallback when that fails."

- [ ] **Step 2: CLAUDE.md**

Append to "Things that cost time":

```
- The site never shows a poster's identifiers. Subject title, type and identifiers come from `subjects`, which the ingester writes by fetching the subject record from its PDS and running the lenses (`ingest.go` `resolveSubjects`); the review's own `subject_title`/`subject_type` are only the fallback. A missing link on a subject page means the fetch or lens failed for that subject (grep the ingester log for its uri); saving the review again with a new subject cid retries it. Adding a link for a new identifier key is one row in `web/src/lib/identifierLinks.ts` and, for a new brand, a path in `BrandIcon.svelte`. `resolveSubjects` runs before the batch transaction, like handle resolution, so network time never holds the write lock.
```

- [ ] **Step 3: Bean**

Run `beans show ISNOT-x4bn` and edit its notes (`beans edit ISNOT-x4bn` or the equivalent) to replace the "canonical rule for title/type/identifiers" paragraph with: "Subject metadata is canonical in the `subjects` table (lensed server-side at ingest, spec 2026-09-17); the XRPC resolveSubject endpoint can reuse `ingester.lensSubject`." Do not close the bean.

- [ ] **Step 4: Commit**

```bash
git add README.md CLAUDE.md .beans
git commit -m "docs: describe server-side subject resolution and where links come from"
```

(If `beans` stores its data somewhere other than `.beans`, add that path instead; `git status` shows it.)
