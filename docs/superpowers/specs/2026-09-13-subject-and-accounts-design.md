# Subject object and accounts design

Second piece of the isnot.at appview (bean ISNOT-0gxo). Extends the `at.isnot.tag` lexicon
so a tag carries enough about its subject to display, and teaches the ingester to record
handles. The lexicon has never been published, so it changes in place at version 1.
Nothing is deployed, so the initial migration is rewritten in place too; from the first
deploy onward migrations are append-only.

## Lexicon

`lexicons/at/isnot/tag.json` gains two defs and the record's `subject` becomes a ref to
`#subject` instead of `com.atproto.repo.strongRef`. The vendored strongRef lexicon is
deleted.

| def | field | type | constraints |
|---|---|---|---|
| `#subject` | uri | string, format at-uri | required |
| | cid | string, format cid | required. The uri's cid when the tag was last updated |
| | title | string | required, 1–256 graphemes, max 2560 bytes |
| | type | string | required, max 64 bytes, knownValues movie, tv-series, tv-episode, book, album, post |
| | identifiers | array of `#identifier` | optional, max 32 items |
| `#identifier` | key | string | required, max 64 bytes |
| | value | string | required, max 512 bytes |

Descriptions: subject is "The thing being tagged, described well enough to display without
fetching the referenced record"; type is "The kind of thing the subject is. Open set; add
values as lenses support them"; identifiers is "External identifiers for the subject, such as
imdbId or isbn13". `direction`, `adjective` and `updatedAt` are unchanged.

## Schema

```sql
CREATE TABLE tags (
  did                 TEXT NOT NULL,
  rkey                TEXT NOT NULL,
  subject_uri         TEXT NOT NULL,
  subject_cid         TEXT NOT NULL,
  subject_title       TEXT NOT NULL,
  subject_type        TEXT NOT NULL,
  adjective           TEXT NOT NULL,
  direction           INTEGER NOT NULL CHECK (direction BETWEEN -2 AND 2),
  updated_at          TEXT NOT NULL,
  PRIMARY KEY (did, rkey)
);
CREATE INDEX tags_subject ON tags (subject_uri);
CREATE INDEX tags_adjective ON tags (adjective);
CREATE TABLE tag_identifiers (
  did   TEXT NOT NULL,
  rkey  TEXT NOT NULL,
  key   TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (did, rkey, key, value),
  FOREIGN KEY (did, rkey) REFERENCES tags (did, rkey) ON DELETE CASCADE
);
CREATE INDEX tag_identifiers_lookup ON tag_identifiers (key, value);
CREATE TABLE accounts (
  did        TEXT PRIMARY KEY,
  handle     TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
CREATE TABLE cursor (id INTEGER PRIMARY KEY CHECK (id = 1), seq INTEGER NOT NULL);
```

`tag_identifiers` holds one row per identifier and is replaced wholesale on each tag
upsert; rows cascade away when the tag is deleted. An empty `handle` means unresolved.

## Fold rules

The existing rules stand. Additions:

| event | action |
|---|---|
| commit create / update, valid record | upsert the tag; ensure an accounts row exists for the DID |
| identity with a non-empty handle | upsert accounts `(did, handle, event time)`: handle is the event's handle, or empty when it is `handle.invalid`; the timestamp is the event's time normalised to UTC |
| identity with an empty handle | ignore |
| account `deleted`, sync | unchanged: delete the DID's tags. The accounts row stays |

Ensuring an accounts row: before opening the batch transaction, collect the DIDs of create or
update commits in the batch that have no accounts row yet (validation happens later, inside
the transaction; an accounts row for a DID whose record turns out invalid is harmless), and resolve each one's handle with an
atmos identity `Directory` (default resolver, in-memory cache, handle verification on). A
lookup that fails or returns `atmos.HandleInvalid` logs a warning and stores an empty handle.
Resolution happens outside the transaction so network time never holds the write lock.
The resolver is a function field on the ingester so tests inject a stub.

## Testing

Extend `ingest_test.go`: a valid record now carries the full subject and the fold test
asserts title, type and identifiers JSON round-trip; a record missing `title` is invalid; a
new test covers accounts: a commit from an unseen DID creates a row with the stubbed
handle, a resolver error leaves the handle empty, an identity event with a handle updates
the row, and a known DID does not trigger resolution again.

## Out of scope

Lenses, XRPC endpoints, handle-to-DID lookup for profile URLs, backfilling handles for rows
whose resolution failed.
