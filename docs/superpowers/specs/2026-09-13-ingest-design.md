# is/not ingester design

The first piece of the isnot.at appview: a Go service that watches jetstream v2 for
`at.isnot.tag` records and folds them into a SQLite database. XRPC endpoints, the
SvelteKit site, and the shared container are separate specs.

## Lexicon

`lexicons/at/isnot/tag.json` defines the `at.isnot.tag` record (path mirrors the NSID):

| field | type | constraints |
|---|---|---|
| subject | ref `com.atproto.repo.strongRef` | required |
| adjective | string | required, 1–16 graphemes, max 160 bytes |
| direction | integer | required, enum -2, -1, 0, 1, 2 |
| updatedAt | string | required, format datetime |

Record key is a TID.

## Stack

- Go module `github.com/jphastings/isnot`, code at the repo root. SvelteKit lands later in `web/`.
- Jetstream: `github.com/bluesky-social/jetstream` (official v2 client). Subscribe with
  `WithCollection("at.isnot.tag")`. Resume with `WithLiveCursor` from the persisted cursor.
  If `JETSTREAM_API_KEY` is set and no cursor exists, use `WithAfterSeq(0)` to replay the
  archive first. Without a key, start from the live tip.
- Validation: `github.com/jcalabro/atmos` (already a dependency of the jetstream client).
  At startup, parse our lexicon and atmos's bundled `com.atproto.repo.strongRef` into a
  `lexicon.Catalog`, resolve it, and run `lexval.ValidateRecord` on every create/update.
  Invalid records are logged at warn level and skipped. The lexicon JSON is the single
  source of truth for constraints; no codegen.
- SQLite: `modernc.org/sqlite`, WAL journal mode, so a second process (SvelteKit, read-only)
  can read the file concurrently.
- Migrations: numbered `.sql` files under `migrations/`, embedded with `embed.FS`, applied in
  order by a small runner that records the applied version in a `schema_version` table.

## Layout

```
lexicons/at/isnot/tag.json
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
| commit create / update, invalid record | log and skip |
| commit delete | delete the `(did, rkey)` row |
| account, `active=false`, `status="deleted"` | delete every row for the DID |
| account, any other status | ignore |
| sync | delete every row for the DID; replacement commits follow |
| identity | ignore |

Each batch is applied in a single transaction that ends by writing `batch.LastCursor()`,
so a crash never leaves the cursor ahead of the data. Recoverable stream errors are logged
and iteration continues; an error matching `jetstream.ErrFatal` exits non-zero.

## Schema

```sql
CREATE TABLE tags (
  did         TEXT NOT NULL,
  rkey        TEXT NOT NULL,
  subject_uri TEXT NOT NULL,
  subject_cid TEXT NOT NULL,
  adjective   TEXT NOT NULL,
  direction   INTEGER NOT NULL CHECK (direction BETWEEN -2 AND 2),
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (did, rkey)
);
CREATE INDEX tags_subject ON tags (subject_uri);
CREATE INDEX tags_adjective ON tags (adjective);
CREATE TABLE cursor (id INTEGER PRIMARY KEY CHECK (id = 1), seq INTEGER NOT NULL);
```

## Configuration

| env var | default | purpose |
|---|---|---|
| `DATABASE_PATH` | `isnot.db` | SQLite file |
| `JETSTREAM_HOST` | `jetstream.us-east.bsky.network` | jetstream instance |
| `JETSTREAM_API_KEY` | unset | enables metered archive replay on first run |

## Testing

One behavioral test file. Construct `jetstream.Event` values in Go, run them through the
fold against a temp database, and assert rows and cursor for: create, update, delete, an
invalid record being skipped, and account deletion purging rows. The live websocket is not
tested.

## Out of scope

SvelteKit site, XRPC endpoints, Dockerfile for the shared container, handle resolution.
