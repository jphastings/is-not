# Creating a lens

A lens teaches `@is-not/lenses` how to turn one atproto record collection into an
`at.isnot.review#subject`. This walks through adding support for a new collection end to
end, using a hypothetical `com.example.book` lexicon as the worked example: records with
a `title`, a `kind` of `novel` or `comic`, and an `ids` object of identifiers. The whole
change ships in one commit or PR. Paths below are relative to `packages/lenses/` unless
stated otherwise.

## 1. Find and vendor the source lexicon

Find the collection's lexicon JSON (the collection author's own repo, or resolved from
its NSID via the lexicon resolution spec) and copy it **verbatim** — no reformatting —
under `lexicons/`, mirroring its NSID as a path: dots become directory separators, the
last segment is the filename.

`com.example.book` → `lexicons/com/example/book.json`:

```json
{
  "lexicon": 1,
  "id": "com.example.book",
  "defs": {
    "main": {
      "type": "record",
      "key": "tid",
      "record": {
        "type": "object",
        "required": ["title", "kind"],
        "properties": {
          "title": { "type": "string" },
          "kind": { "type": "string", "enum": ["novel", "comic"] },
          "ids": {
            "type": "object",
            "properties": {
              "isbn": { "type": "string" },
              "asin": { "type": "string" }
            }
          }
        }
      }
    }
  }
}
```

Vendoring verbatim (rather than hand-trimming it) keeps the schema panproto compiles against identical to what the author publishes, and diffs cleanly as it evolves upstream.

## 2. Fetch a real record

Get one real record via `com.atproto.repo.getRecord` — find the DID's PDS from its DID document, then:

```sh
curl "https://<pds>/xrpc/com.atproto.repo.getRecord?repo=<did>&collection=com.example.book&rkey=<rkey>"
```

(`fetchRecord` in `src/index.ts` does the same DID→PDS resolution and call, if it's
easier to run from a script.) You need the record's `uri`, `cid` and `value` — these
become a fixture in step 5. Prefer a record that exercises a non-default branch of any
type mapping (here, `kind: "novel"`, since it's the one that gets rewritten).

## 3. Write the lens document

Add `lenses/<nsid>.json`. Its `id` is `at.isnot.lens.<nsid-with-dashes>`, `source` is the
NSID, `target` is always `at.isnot.review#subject`. `steps` may only use `rename_field`,
`remove_field` (not on arrays — panproto can't remove fields from array items, bean
ISNOT-qvqp), `apply_expr` and `add_field`. Most lenses need two steps: rename the field
holding the work's kind to `type`, then an `apply_expr` if-chain mapping source-specific
values onto the shared vocabulary, passing anything else through:

`lenses/com.example.book.json`:

```json
{
  "id": "at.isnot.lens.com-example-book",
  "description": "A com.example.book record names a book; the tag subject is that book.",
  "source": "com.example.book",
  "target": "at.isnot.review#subject",
  "extensions": { "at.isnot": { "identifiers": "ids" } },
  "steps": [
    { "rename_field": { "old": "kind", "new": "type" } },
    {
      "apply_expr": {
        "field": "type",
        "expr": "if type == \"novel\" then \"book\" else type",
        "coercion": "projection"
      }
    }
  ]
}
```

`novel` becomes `book`; `comic` is untouched. Extend the `if … then … else if …` chain for
every value that needs rewriting; end with `else type` so unmapped values pass through.

**The source lexicon isn't enforced at runtime.** panproto's parser checks the record's
structure only — `enum` and `required` violations in the source lexicon flow through
uncaught. Don't rely on a lens only ever seeing values the lexicon allows.

**Collections with one fixed kind.** When every record is the same kind of thing (a Bluesky
post, a Tangled repo) there is nothing to rename or map; add the constant instead:
`{ "add_field": { "name": "type", "kind": "string", "fallback": "post" } }`. See
`lenses/app.bsky.feed.post.json`.

**Missing titles.** A lens whose view has no `title` (an optional field left unset) doesn't
error: the subject falls back to the paths in `extensions["at.isnot"]["title"]` if the lens
has them (below), then name-like fields on the source record (`title`, `name`,
`displayName`, `text`), then the record's uri.

**The `extensions["at.isnot"]["title"]` convention.** A title nested inside a ref- or
union-typed property can't be hoisted by a lens step (same limitation as identifiers,
below), and some collections keep the name in the record key rather than the record.
`"title"` lists dotted paths on the **source** record, tried in order when the view has no
`title`; the reserved path `"$rkey"` means the uri's record key. `lenses/network.cosmik.card.json`
uses `["content.metadata.title", "content.url", "content.text"]`; `lenses/sh.tangled.repo.json`
uses `["$rkey"]` behind an optional `name`.

**The `extensions["at.isnot"]["identifiers"]` convention.** panproto's lens `get` drops
ref-typed properties from its output (bean ISNOT-qvqp), so an identifiers object — nearly
always `ref`-typed — can't survive a normal lens step. Instead, `extensions` names the
field on the **source** record that holds identifiers (`"ids"` here), and `src/lib.rs`
reads that field straight off the untransformed record. Omit the extension if the
collection has no identifiers object.

`identifiers` also takes a map, for collections whose identifiers are separate top-level
fields rather than one pre-built object: `{"<outputKey>": "<sourceField>"}` reads that
field's value as-is (`lenses/app.rocksky.artist.json` uses `{"mbid": "mbid"}`). A source
field that's a URL with the id embedded in its path — a Spotify track link, say — takes the
long form `{"<outputKey>": {"field": "<sourceField>", "urlSegmentAfter": "<segment>"}}`:
the value is the URL's last path segment (query string stripped) *if* the segment before it
matches `urlSegmentAfter`, otherwise that identifier is omitted rather than being wrong —
`lenses/app.rocksky.song.json` reads a `spotifyTrackId` this way, and
`lenses/app.rocksky.album.json` reads a `spotifyAlbumId` the same way with `"album"`, since
plenty of real album records carry a `/track/` link and that must not be misread as the
album's own id.

**The `extensions["at.isnot"]["titleTemplate"]` convention.** `apply_expr` only sees the one
field's own value, so it can't build a title out of two source fields (a song's title and its
artist); `titleTemplate` names `base` and `detail` dotted paths on the **source** record and
produces `"{base} ({detail})"` when `detail` is present and non-blank, else just `base`. It
takes priority over the view's own `title` (which would otherwise win, since these fields
usually pass straight through unmodified). `lenses/app.rocksky.song.json` and
`lenses/app.rocksky.album.json` both use `{"base": "title", "detail": "artist"}`.

## 4. Register in `SOURCES`

Add one entry to the `SOURCES` array in `src/lib.rs`:

```rust
const SOURCES: &[LensSource] = &[
    LensSource {
        nsid: "social.popfeed.feed.review",
        document: include_str!("../lenses/social.popfeed.feed.review.json"),
        lexicon: include_str!("../lexicons/social/popfeed/feed/review.json"),
    },
    LensSource {
        nsid: "com.example.book",
        document: include_str!("../lenses/com.example.book.json"),
        lexicon: include_str!("../lexicons/com/example/book.json"),
    },
];
```

Lenses compile lazily, on the first call to `resolve_subject` — not at registration or
startup — but the NSID shows up in `supported_collections()` immediately.

## 5. Write the fixture

Add `testdata/<nsid>/<case>.json` with the real record from step 2 as `input` and the
exact expected output as `expected`, written by hand from the lens's rules — not by
running the code and pasting its output, which would only prove the code agrees with
itself.

`testdata/com.example.book/novel.json`:

```json
{
  "input": {
    "uri": "at://did:plc:example/com.example.book/3abc",
    "cid": "bafyreibzsi5ubmnp4dx744kye6ulejwmpdhhnmem2vnaocgqm2fybvzyqa",
    "record": {
      "$type": "com.example.book",
      "title": "Example Title",
      "kind": "novel",
      "ids": { "isbn": "9780000000002" }
    }
  },
  "expected": {
    "supported": true,
    "subject": {
      "uri": "at://did:plc:example/com.example.book/3abc",
      "cid": "bafyreibzsi5ubmnp4dx744kye6ulejwmpdhhnmem2vnaocgqm2fybvzyqa",
      "title": "Example Title",
      "type": "book",
      "identifiers": [{ "key": "isbn", "value": "9780000000002" }]
    }
  }
}
```

Both the Rust and TypeScript suites walk every file under `testdata/` and assert
`resolve(input) == expected`, so one fixture file covers both. Add a second fixture for
the `comic` case (or any other type-mapping branch) if you have a real record for it.

## 6. Run the test suite

From `packages/lenses/`:

```sh
cargo test
sh build-wasm.sh
pnpm exec vp test --run
```

`cargo test` runs the fixtures against the Rust engine directly. `build-wasm.sh` rebuilds
`dist/isnot_lenses.wasm`, which the TypeScript suite loads — it must run first. `vp test --run`
then runs the same fixtures through the TypeScript wrapper.

From the repo root, `go test ./...` runs the Go ingester's tests, which also walk
`packages/lenses/testdata/` against the wasm module via wazero — build or fetch it first
(`sh packages/lenses/build-wasm.sh`, or `scripts/fetch-lenses.sh` for the last release) or this fails to find it.

## 7. Add a changeset

Run `pnpm changeset`, pick `@is-not/lenses`, **minor** (a new lens is a
backwards-compatible feature), and describe the collection you added. This writes a
markdown file under `.changeset/` — commit it alongside everything else.

`.github/workflows/lenses.yml` builds and tests every push and PR. On push to `main` it
also opens or updates a "Version Packages" PR via changesets; merging *that* PR publishes
`@is-not/lenses` to npm and cuts a GitHub release tagged `lenses-v<version>` with
`isnot_lenses.wasm` attached — what `scripts/fetch-lenses.sh` downloads for Go builds
that skip the Rust toolchain.

## Commit checklist

- [ ] `packages/lenses/lenses/<nsid>.json` — the lens document
- [ ] `packages/lenses/lexicons/<nsid-as-path>.json` — the vendored source lexicon, verbatim
- [ ] `SOURCES` entry in `packages/lenses/src/lib.rs`
- [ ] `packages/lenses/testdata/<nsid>/*.json` — fixture(s), with hand-written `expected`
- [ ] Add any new `type` value to `knownValues` in `lexicons/at/isnot/review.json`
- [ ] A changeset under `.changeset/`
- [ ] **Not** `packages/lenses/dist/` — it's git-ignored and built by CI; never commit it
