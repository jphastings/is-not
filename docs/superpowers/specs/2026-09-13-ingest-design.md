# is/not ingester design

The first piece of the isnot.at appview: a Go service that watches jetstream v2 for
`at.isnot.review` records and folds them into a SQLite database. XRPC endpoints, the
SvelteKit site, and the shared container are separate specs.

## Lexicon

`lexicons/at/isnot/review.json` defines the `at.isnot.review` record (path mirrors the NSID):

| field | type | constraints |
|---|---|---|
| subject | ref `#subject` | required |
| tags | array of `#tag` (adjective, direction) | required, 1–32 items |
| createdAt | string | required, format datetime |
| updatedAt | string | required, format datetime |

Record key is a TID.

## Stack

- Go module `github.com/jphastings/is-not`, code at the repo root. SvelteKit lands later in `web/`.
- Jetstream: `github.com/bluesky-social/jetstream` (official v2 client). Subscribe with
  `WithCollection("at.isnot.review")`. If `JETSTREAM_API_KEY` is set, always resume via
  archive replay with `WithAfterSeq(cursor)` (0 on first run replays the whole archive;
  a non-zero cursor resumes from it even past the live lookback window). Without a key,
  resume with `WithLiveCursor(cursor)` when a cursor is persisted, otherwise start from
  the live tip.
- Validation: `github.com/jcalabro/atmos` (already a dependency of the jetstream client).
  atmos does not embed its lexicons, so we keep a verbatim copy of the upstream
  `com.atproto.repo.strongRef` schema under `lexicons/com/atproto/repo/`. At startup,
  parse our lexicon and that copy into a `lexicon.Catalog`, resolve it, and run
  `lexval.ValidateRecord` on every create/update. Invalid records are logged at warn
  level. The lexicon JSON is the single source of truth for constraints; no codegen.
- SQLite: `modernc.org/sqlite`, WAL journal mode, so a second process (SvelteKit, read-only)
  can read the file concurrently.
- Migrations: numbered `.sql` files under `migrations/`, embedded with `embed.FS`, applied in
  order by a small runner that records the applied version in a `schema_version` table.

## Layout

```
lexicons/at/isnot/review.json
migrations/001_init.sql
main.go        env config, open db, migrate, run ingest, stop on SIGINT/SIGTERM
db.go          open (WAL), migrate, upsert/delete/purge/cursor
ingest.go      subscribe, validate, fold each batch in one transaction
ingest_test.go
```

## Fold rules

Delivery is at-least-once and eventually consistent, so folding must be idempotent.

| event | action |
|---|---|
| commit create / update, valid record | upsert on `(did, rkey)` |
| commit create / update, invalid record | log, delete any existing `(did, rkey)` row |
| commit delete | delete the `(did, rkey)` row |
| account, `active=false`, `status="deleted"` | delete every row for the DID |
| account, any other status | ignore |
| sync | delete every row for the DID; replacement commits follow |
| identity | ignore |

A record that fails validation, including a record whose `createdAt` or `updatedAt` fails
to parse, is treated as invalid: any existing row for that `(did, rkey)` is deleted, so the
table only ever holds currently-valid reviews.

Each batch is applied in a single transaction that ends by writing `batch.LastCursor()`
with `seq = MAX(seq, excluded.seq)`, so a crash never leaves the cursor ahead of the data
and an out-of-order batch can never move it backwards. Recoverable stream errors are logged
and iteration continues; an error matching `jetstream.ErrFatal` exits non-zero.

## Schema

```sql
CREATE TABLE reviews (
  did         TEXT NOT NULL,
  rkey        TEXT NOT NULL,
  subject_uri TEXT NOT NULL,
  subject_cid TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (did, rkey)
);
CREATE INDEX reviews_subject ON reviews (subject_uri);
CREATE TABLE review_tags (
  did       TEXT NOT NULL,
  rkey      TEXT NOT NULL,
  adjective TEXT NOT NULL,
  direction INTEGER NOT NULL CHECK (direction BETWEEN -2 AND 2),
  PRIMARY KEY (did, rkey, adjective),
  FOREIGN KEY (did, rkey) REFERENCES reviews (did, rkey) ON DELETE CASCADE
);
CREATE INDEX review_tags_adjective ON review_tags (adjective);
CREATE TABLE cursor (id INTEGER PRIMARY KEY CHECK (id = 1), seq INTEGER NOT NULL);
```

`created_at` and `updated_at` are stored normalised to UTC in the fixed-width layout
`2006-01-02T15:04:05.000Z` (`atmos.AtprotoDatetimeLayout`), so TEXT ordering is
chronological. `review_tags` is replaced wholesale on each upsert (insert with `INSERT OR
REPLACE`, so a repeated adjective in one record keeps the last entry) and cascades away
when the review is deleted.

## Configuration

| env var | default | purpose |
|---|---|---|
| `DATABASE_PATH` | `isnot.db` | SQLite file |
| `JETSTREAM_HOST` | `jetstream.us-east.bsky.network` | jetstream instance |
| `JETSTREAM_API_KEY` | unset | enables metered archive replay; when set, resume always goes through archive replay via `WithAfterSeq(cursor)` |

## Testing

One behavioral test file. Construct `jetstream.Event` values in Go, run them through the
fold against a temp database, and assert rows and cursor for: create, update, delete, an
an invalid record deleting a stale row, and account deletion purging rows. The live websocket is not
tested.

## Out of scope

SvelteKit site, XRPC endpoints, Dockerfile for the shared container, handle resolution.
