# Subject Object and Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tags carry a displayable subject (title, type, identifiers) and the ingester records each tagging account's handle.

**Architecture:** The `at.isnot.tag` lexicon is rewritten in place so `subject` is a local `#subject` object; the initial migration is rewritten in place to add subject columns and an `accounts` table. `ingest.go` stores the extra subject fields and, before each batch's transaction, resolves handles for DIDs it has not seen through a function field that production wires to an atmos identity `Directory`. Jetstream identity events update handles.

**Tech Stack:** Go 1.26, `github.com/bluesky-social/jetstream`, `github.com/jcalabro/atmos` (`lexicon`, `lexval`, `identity`), `modernc.org/sqlite`.

**Spec:** `docs/superpowers/specs/2026-09-13-subject-and-accounts-design.md`

## Global Constraints

- `package main` at the repo root; module `github.com/jphastings/isnot`. No new dependencies (atmos `identity` is already in the module graph).
- Lexicon stays at version 1 and is edited in place; the vendored strongRef lexicon is deleted.
- `migrations/001_init.sql` is rewritten in place (nothing is deployed). CLAUDE.md gains one line: migrations are append-only from the first deploy onward.
- Title: 1–256 graphemes, max 2560 bytes. Type: max 64 bytes, knownValues `movie`, `tv-series`, `tv-episode`, `book`, `album`, `post`. Identifiers: optional array, max 32 items, each `{key ≤ 64 bytes, value ≤ 512 bytes}`.
- `subject_identifiers` is JSON text, `[]` when the record has none. `handle` is `''` when unresolved.
- Handle resolution runs before the batch transaction opens, only for DIDs with no `accounts` row, via a function field `resolveHandle func(ctx, did string) (string, error)` on `ingester`. Failure or `atmos.HandleInvalid` → warning and empty handle.
- Tests are behavioral: assert on database rows. Keep them concise. Comments only where code is counter-intuitive.
- Commit to `main`. Commit messages say what and why, no test summaries, no attribution lines.

---

### Task 1: Subject object in the lexicon, schema and fold

**Files:**
- Modify: `lexicons/at/isnot/tag.json` (rewrite)
- Delete: `lexicons/com/atproto/repo/strongRef.json`
- Modify: `migrations/001_init.sql` (rewrite)
- Modify: `ingest.go:105-131` (`applyCommit`)
- Modify: `ingest_test.go`
- Modify: `CLAUDE.md`

**Interfaces:**
- Produces: `tags` columns `subject_title`, `subject_type`, `subject_identifiers`; `accounts(did, handle, updated_at)` table (used by Task 2).
- Produces: test helper `tagRecord(adjective string, direction any) map[string]any` now returns a full subject.

- [ ] **Step 1: Rewrite the lexicon and delete the strongRef copy**

`lexicons/at/isnot/tag.json`:

```json
{
  "lexicon": 1,
  "id": "at.isnot.tag",
  "defs": {
    "main": {
      "type": "record",
      "key": "tid",
      "description": "A lightweight 'is/not' review of something represented by another atproto record",
      "record": {
        "type": "object",
        "required": ["subject", "adjective", "direction", "updatedAt"],
        "properties": {
          "subject": {
            "type": "ref",
            "ref": "#subject",
            "description": "The thing being tagged, described well enough to display without fetching the referenced record. Readers can decide whether the cid must match for their purposes, or whether the at-uri alone is enough."
          },
          "adjective": {
            "type": "string",
            "minGraphemes": 1,
            "maxGraphemes": 16,
            "maxLength": 160,
            "description": "An adjective, in any language, that the subject either is, or is not."
          },
          "direction": {
            "type": "integer",
            "enum": [-2, -1, 0, 1, 2],
            "description": "Whether the subject *is* the adjective (1), *is not* the adjective (-1) or, less commonly, *really* is (2), or *really* isn't (-2). A value of zero is an explicit 'no comment', uncertainty, or lack of opinion."
          },
          "updatedAt": {
            "type": "string",
            "format": "datetime"
          }
        }
      }
    },
    "subject": {
      "type": "object",
      "required": ["uri", "cid", "title", "type"],
      "properties": {
        "uri": {
          "type": "string",
          "format": "at-uri",
          "description": "The atproto record that represents the thing being tagged."
        },
        "cid": {
          "type": "string",
          "format": "cid",
          "description": "The uri's cid when this tag was last updated."
        },
        "title": {
          "type": "string",
          "minGraphemes": 1,
          "maxGraphemes": 256,
          "maxLength": 2560,
          "description": "The name of the thing being tagged, usually copied from a field on the subject record."
        },
        "type": {
          "type": "string",
          "maxLength": 64,
          "knownValues": ["movie", "tv-series", "tv-episode", "book", "album", "post"],
          "description": "The kind of thing the subject is. Open set; add values as lenses support them."
        },
        "identifiers": {
          "type": "array",
          "maxLength": 32,
          "items": { "type": "ref", "ref": "#identifier" },
          "description": "External identifiers for the subject, such as imdbId or isbn13."
        }
      }
    },
    "identifier": {
      "type": "object",
      "required": ["key", "value"],
      "properties": {
        "key": { "type": "string", "maxLength": 64 },
        "value": { "type": "string", "maxLength": 512 }
      }
    }
  }
}
```

Then:

```bash
git rm -q lexicons/com/atproto/repo/strongRef.json
rmdir lexicons/com/atproto/repo lexicons/com/atproto lexicons/com
```

- [ ] **Step 2: Rewrite the migration**

`migrations/001_init.sql`:

```sql
CREATE TABLE tags (
  did                 TEXT NOT NULL,
  rkey                TEXT NOT NULL,
  subject_uri         TEXT NOT NULL,
  subject_cid         TEXT NOT NULL,
  subject_title       TEXT NOT NULL,
  subject_type        TEXT NOT NULL,
  subject_identifiers TEXT NOT NULL DEFAULT '[]',
  adjective           TEXT NOT NULL,
  direction           INTEGER NOT NULL CHECK (direction BETWEEN -2 AND 2),
  updated_at          TEXT NOT NULL,
  PRIMARY KEY (did, rkey)
);
CREATE INDEX tags_subject ON tags (subject_uri);
CREATE INDEX tags_adjective ON tags (adjective);
CREATE TABLE accounts (
  did        TEXT PRIMARY KEY,
  handle     TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
CREATE TABLE cursor (id INTEGER PRIMARY KEY CHECK (id = 1), seq INTEGER NOT NULL);
```

- [ ] **Step 3: Update the tests (failing first)**

In `ingest_test.go`:

Replace `tagRecord` with:

```go
func tagRecord(adjective string, direction any) map[string]any {
	return map[string]any{
		"subject": map[string]any{
			"uri":         "at://did:plc:subject/app.bsky.feed.post/3abc",
			"cid":         validCID,
			"title":       "A Post",
			"type":        "post",
			"identifiers": []any{map[string]any{"key": "imdbId", "value": "tt1"}},
		},
		"adjective": adjective,
		"direction": direction,
		"updatedAt": "2026-09-13T12:00:00.000Z",
	}
}
```

In `TestOpenDBMigratesOnceAndIsRepeatable`, change the column probe to:

```go
		if _, err := db.Exec(`SELECT did, rkey, subject_uri, subject_cid, subject_title, subject_type, subject_identifiers, adjective, direction, updated_at FROM tags`); err != nil {
			t.Fatal(err)
		}
		if _, err := db.Exec(`SELECT did, handle, updated_at FROM accounts`); err != nil {
			t.Fatal(err)
		}
```

Append two tests:

```go
func TestFoldStoresSubjectFields(t *testing.T) {
	in := newTestIngester(t)
	apply(t, in, 1, commitEvent("did:plc:a", "3k1", jetstream.OpCreate, tagRecord("x", int64(1))))

	var title, typ, identifiers string
	if err := in.db.QueryRow(`SELECT subject_title, subject_type, subject_identifiers FROM tags WHERE did = ? AND rkey = ?`, "did:plc:a", "3k1").Scan(&title, &typ, &identifiers); err != nil {
		t.Fatal(err)
	}
	if title != "A Post" || typ != "post" || identifiers != `[{"key":"imdbId","value":"tt1"}]` {
		t.Fatalf("subject = %q %q %q", title, typ, identifiers)
	}

	record := tagRecord("y", int64(1))
	delete(record["subject"].(map[string]any), "identifiers")
	apply(t, in, 2, commitEvent("did:plc:a", "3k2", jetstream.OpCreate, record))
	if err := in.db.QueryRow(`SELECT subject_identifiers FROM tags WHERE rkey = '3k2'`).Scan(&identifiers); err != nil {
		t.Fatal(err)
	}
	if identifiers != "[]" {
		t.Fatalf("identifiers without any = %q, want []", identifiers)
	}
}

func TestFoldRejectsSubjectWithoutTitle(t *testing.T) {
	in := newTestIngester(t)
	record := tagRecord("x", int64(1))
	delete(record["subject"].(map[string]any), "title")
	apply(t, in, 1, commitEvent("did:plc:a", "3k1", jetstream.OpCreate, record))
	if got := allRows(t, in.db); len(got) != 0 {
		t.Fatalf("rows = %+v, want none", got)
	}
}
```

- [ ] **Step 4: Run the tests to see them fail**

Run: `go test ./...`
Expected: FAIL. `TestOpenDBMigratesOnceAndIsRepeatable` passes only after Step 2; `TestFoldStoresSubjectFields` fails on the INSERT (`NOT NULL constraint failed: tags.subject_title`) and the older fold tests fail the same way until Step 5.

- [ ] **Step 5: Store the subject fields**

In `ingest.go`, add `"encoding/json"` to the imports and replace `applyCommit`'s tail (from `subject := ...` to the end of the function) with:

```go
	subject := c.Record["subject"].(map[string]any)
	identifiers := "[]"
	if ids, ok := subject["identifiers"]; ok && ids != nil {
		b, err := json.Marshal(ids)
		if err != nil {
			return err
		}
		identifiers = string(b)
	}
	_, err = tx.Exec(`
		INSERT INTO tags (did, rkey, subject_uri, subject_cid, subject_title, subject_type, subject_identifiers, adjective, direction, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT (did, rkey) DO UPDATE SET
			subject_uri         = excluded.subject_uri,
			subject_cid         = excluded.subject_cid,
			subject_title       = excluded.subject_title,
			subject_type        = excluded.subject_type,
			subject_identifiers = excluded.subject_identifiers,
			adjective           = excluded.adjective,
			direction           = excluded.direction,
			updated_at          = excluded.updated_at`,
		did, c.Rkey, subject["uri"], subject["cid"], subject["title"], subject["type"], identifiers,
		c.Record["adjective"], c.Record["direction"], updatedAt)
	return err
```

- [ ] **Step 6: Run the tests**

Run: `gofmt -l . && go vet ./... && go test ./...`
Expected: gofmt prints nothing; all tests PASS (the lexicon validator resolves `#subject` and `#identifier` locally, so `loadCatalog` needs no change).

- [ ] **Step 7: Note the migration rule in CLAUDE.md**

Under "## Working here" in `CLAUDE.md`, add the bullet:

```markdown
- Migrations in `migrations/` are append-only once anything is deployed. Until then, editing `001_init.sql` in place is fine.
```

- [ ] **Step 8: Commit**

```bash
git add lexicons migrations ingest.go ingest_test.go CLAUDE.md
git commit -m "feat: subject object with title, type and identifiers

The at.isnot.tag subject is now a local #subject def so a tag can be
displayed without fetching the record it points at. The strongRef copy
is no longer needed. Nothing is deployed, so the initial migration and
the version-1 lexicon change in place."
```

---

### Task 2: Accounts table and handle resolution

**Files:**
- Modify: `ingest.go` (`ingester` struct, `applyBatch`, `apply`)
- Modify: `ingest_test.go` (`newTestIngester`, new test)
- Modify: `main.go` (wire the resolver)

**Interfaces:**
- Consumes: `accounts` table from Task 1.
- Produces: `ingester.resolveHandle func(ctx context.Context, did string) (string, error)`.
- Produces: `func handleResolver() func(ctx context.Context, did string) (string, error)` in `main.go`, backed by an atmos identity `Directory`.

- [ ] **Step 1: Write the failing test**

In `ingest_test.go`, change `newTestIngester`'s return to include a stub that never touches the network:

```go
	return &ingester{
		db: db, cat: cat, log: slog.New(slog.DiscardHandler),
		resolveHandle: func(context.Context, string) (string, error) { return "", nil },
	}
```

Add `"errors"` to the test imports and append:

```go
func identityEvent(did, handle string) jetstream.Event {
	return jetstream.Event{DID: did, Kind: jetstream.KindIdentity, Identity: &jetstream.Identity{DID: did, Handle: handle, Time: "2026-09-13T12:00:00.000Z"}}
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
		commitEvent("did:plc:a", "3k1", jetstream.OpCreate, tagRecord("x", int64(1))),
		commitEvent("did:plc:b", "3k1", jetstream.OpCreate, tagRecord("y", int64(1))),
	)
	if got := handles(t, in.db); len(got) != 2 || got["did:plc:a"] != "a.example" || got["did:plc:b"] != "" {
		t.Fatalf("accounts after first batch = %v", got)
	}

	apply(t, in, 2, commitEvent("did:plc:a", "3k2", jetstream.OpCreate, tagRecord("z", int64(1))))
	if calls != 2 {
		t.Fatalf("resolver calls = %d, want 2 (known DIDs are not re-resolved)", calls)
	}

	apply(t, in, 3, identityEvent("did:plc:b", "bee.example"), identityEvent("did:plc:a", ""))
	if got := handles(t, in.db); got["did:plc:b"] != "bee.example" || got["did:plc:a"] != "a.example" {
		t.Fatalf("accounts after identity events = %v", got)
	}
}
```

- [ ] **Step 2: Run the test to see it fail**

Run: `go test ./... -run TestAccountsResolved`
Expected: FAIL to compile with `unknown field resolveHandle in struct literal`.

- [ ] **Step 3: Implement resolution and identity handling**

In `ingest.go`:

Change the struct to:

```go
type ingester struct {
	db            *sql.DB
	cat           *lexicon.Catalog
	log           *slog.Logger
	resolveHandle func(ctx context.Context, did string) (string, error)
}
```

Replace `applyBatch` with:

```go
func (in *ingester) applyBatch(ctx context.Context, events []jetstream.Event, cursor uint64) error {
	// Resolve before the transaction so network time never holds the write lock.
	newAccounts, err := in.resolveNewAccounts(ctx, events)
	if err != nil {
		return err
	}
	tx, err := in.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	now := time.Now().UTC().Format(atmos.AtprotoDatetimeLayout)
	for did, handle := range newAccounts {
		if _, err := tx.Exec(`INSERT INTO accounts (did, handle, updated_at) VALUES (?, ?, ?) ON CONFLICT (did) DO NOTHING`, did, handle, now); err != nil {
			return err
		}
	}
	for _, evt := range events {
		if err := in.apply(tx, evt); err != nil {
			return err
		}
	}
	if cursor > 0 {
		if _, err := tx.Exec(`INSERT INTO cursor (id, seq) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET seq = MAX(seq, excluded.seq)`, cursor); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// resolveNewAccounts returns handles for DIDs that create or update a tag in this
// batch and have no accounts row yet. A failed lookup yields an empty handle.
func (in *ingester) resolveNewAccounts(ctx context.Context, events []jetstream.Event) (map[string]string, error) {
	handles := map[string]string{}
	for _, evt := range events {
		if evt.Kind != jetstream.KindCommit || evt.Commit.Collection != collection || evt.Commit.Operation == jetstream.OpDelete {
			continue
		}
		if _, seen := handles[evt.DID]; seen {
			continue
		}
		var exists bool
		if err := in.db.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM accounts WHERE did = ?)`, evt.DID).Scan(&exists); err != nil {
			return nil, err
		}
		if exists {
			continue
		}
		resolveCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
		handle, err := in.resolveHandle(resolveCtx, evt.DID)
		cancel()
		if err != nil {
			in.log.Warn("handle resolution failed", "did", evt.DID, "err", err)
			handle = ""
		}
		handles[evt.DID] = handle
	}
	return handles, nil
}
```

In `apply`, add a case before `default` fall-through (after the `KindSync` case):

```go
	case jetstream.KindIdentity:
		if evt.Identity.Handle == "" {
			return nil
		}
		_, err := tx.Exec(`INSERT INTO accounts (did, handle, updated_at) VALUES (?, ?, ?)
			ON CONFLICT (did) DO UPDATE SET handle = excluded.handle, updated_at = excluded.updated_at`,
			evt.DID, evt.Identity.Handle, evt.Identity.Time)
		return err
```

- [ ] **Step 4: Run the tests**

Run: `gofmt -l . && go vet ./... && go test ./...`
Expected: all PASS.

- [ ] **Step 5: Wire the real resolver in main.go**

Add imports `"time"`, `"github.com/jcalabro/atmos"`, `"github.com/jcalabro/atmos/identity"`. Change the ingester construction to:

```go
	in := &ingester{db: db, cat: cat, log: log, resolveHandle: handleResolver()}
```

and add:

```go
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
			return "", nil
		}
		return string(id.Handle), nil
	}
}
```

- [ ] **Step 6: Verify the real resolver once, without committing anything**

Create a throwaway file in the scratchpad directory named in your dispatch, not in the repo:

```go
package main

import (
	"context"
	"fmt"
	"time"

	"github.com/jcalabro/atmos"
	"github.com/jcalabro/atmos/identity"
)

func main() {
	dir := &identity.Directory{Resolver: &identity.DefaultResolver{}, Cache: identity.NewLRUCache(10, time.Hour)}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	id, err := dir.LookupDID(ctx, atmos.DID("did:plc:ephkzpinhaqcabtkugtbzrwu"))
	fmt.Println(id.Handle, err)
}
```

Run it with `go run` from a module that requires `github.com/jcalabro/atmos@v0.4.0`. Expected: prints a handle ending in a real domain (this DID is JP's own account) and `<nil>`. If it prints `handle.invalid` or an error, stop and report the output rather than changing the code.

- [ ] **Step 7: Build, vet, test, commit**

```bash
gofmt -l . && go vet ./... && go build ./... && go test ./...
git add ingest.go ingest_test.go main.go
git commit -m "feat: record handles for tagging accounts

New DIDs are resolved through atmos identity before each batch's
transaction so the lookup never holds the write lock; jetstream identity
events keep handles current."
```
