# Lenses package design

Bean ISNOT-sq4b. One artifact, built from panproto lens documents, that turns an atproto
record into an `at.isnot.tag` subject. It runs in the browser, in Node and in the Go API
without any native toolchain at use sites.

## Why wasm

panproto has a Rust engine and a TypeScript WASM SDK but no Go bindings. A spike proved a
`cdylib` crate compiles to a ~340KB gzipped wasm with a plain buffer ABI that Go runs via
wazero and browsers run via `WebAssembly.instantiate`. The finalizer (identifiers, type
mapping, validation) therefore exists once, in Rust. See the `panproto-findings` memory and
bean ISNOT-qvqp for the engine's known limitations.

## Layout

```
packages/lenses/
  Cargo.toml, src/lib.rs        Rust cdylib: engine + embedded lenses + finalizer
  lenses/<nsid>.json            panproto lens documents, one per supported NSID
  lexicons/<path>.json          verbatim copies of each source lexicon
  testdata/<nsid>/<name>.json   {"input": {uri, cid, record}, "expected": <output>}
  package.json, index.ts        @is-not/lenses TypeScript wrapper
  vite.config.ts                vp pack + vitest config
  dist/isnot_lenses.wasm        built artifact, git-ignored
  README.md
lens.go, lens_test.go           Go wrapper (root package main), embeds dist/isnot_lenses.wasm
scripts/fetch-lenses.sh         downloads the released wasm for Go builds
.github/workflows/lenses.yml    test on change; on version bump: GitHub release + npm publish
```

Root tooling: pnpm workspace (`packages/*`, later `web/`), Vite+ (`vp`) for format, lint,
test and pack, changesets for versioning.

## Lens documents

A lens document is panproto JSON: `id`, `source` (the record NSID), `target`
`"at.isnot.tag#subject"`, and `steps`. Steps used today: `rename_field`, `remove_field`,
`apply_expr`. Two engine limitations shape the conventions:

- Fields typed as a `ref` to another def are dropped by the engine's get. Identifiers are
  therefore named in the document's `extensions` block, which panproto preserves:
  `"extensions": {"at.isnot": {"identifiers": "identifiers"}}` means "the source field
  `identifiers` is an object whose string entries become key/value identifiers".
- `remove_field` on an array property errors, so arrays are left in place and ignored.

The view a lens produces must contain `title` (string) and `type` (string). Everything else
in the view is ignored.

First lens, `social.popfeed.feed.review`: keep `title`, rename `creativeWorkType` to `type`
and rewrite values with an if-chain: `tv_show → tv-show`, `tv_season → tv-season`,
`tv_episode → tv-episode`, `book_series → book-series`, `video_game → video-game`,
`track → music-track`; everything else passes through. Identifiers via the extensions block.

The `at.isnot.tag` lexicon's `type` knownValues become: movie, tv-show, tv-season,
tv-episode, book, book-series, album, music-track, video-game, post.

## Wasm ABI

Exports, no wasm-bindgen:

| export | contract |
|---|---|
| `alloc(len: u32) -> ptr` | caller writes input bytes here |
| `dealloc(ptr, len)` | frees a buffer from `alloc` or a result |
| `resolve_subject(ptr, len) -> ptr` | result is `[u32 little-endian len][utf-8 json]`; free with `dealloc(ptr, 4+len)` |
| `supported_collections() -> ptr` | same result framing; a JSON array of NSIDs |

`resolve_subject` input: `{"uri": at-uri, "cid": cid, "record": {...}}`. The NSID is taken
from the uri's collection segment (fallback: the record's `$type`).

Output on success:

```json
{"supported": true, "subject": {"uri": "...", "cid": "...", "title": "...", "type": "...",
 "identifiers": [{"key": "imdbId", "value": "tt9603208"}]}}
```

Unsupported NSID: `"supported": false` with a best-guess subject: title from the first
present string among `title`, `name`, `displayName`, `text`; type `""`; identifiers from any
top-level string field whose name ends in `Id` or `ID`, plus `isbn`, `isbn10`, `isbn13`,
`asin`, `doi`. If no title candidate exists, title is the uri.

Supported NSID with a view that has no `title` (an optional field left unset): same
title-candidate fallback as the unsupported path, over the untransformed source record, then
the uri if none match — `supported` stays `true`.

Error: `{"error": "<message>"}` for malformed input or a lens that fails to apply. panproto's
parser checks structure only, not the source lexicon's constraints, so `enum` and `required`
violations in the source record are not errors — `type` on the supported path is therefore
not guaranteed to be a knownValue of `at.isnot.tag`.

Finalizer rules, applied to both paths: title is trimmed and truncated to 256 graphemes
(unicode-segmentation) and 2560 bytes; type is truncated to 64 bytes; identifiers are sorted
by key then value, deduplicated, capped at 32, with key ≤ 64 bytes and value ≤ 512 bytes
(longer entries dropped); `identifiers` is omitted when empty. The output is the exact
`#subject` shape, so hosts can validate it with their own lexicon tooling.

## TypeScript package `@is-not/lenses`

ESM, Node 20+ and browsers. Exports:

- `loadLenses(source?: BufferSource | URL | Promise<...>): Promise<Lenses>` instantiates the
  wasm (default: the copy shipped in the package, via `new URL('./isnot_lenses.wasm',
  import.meta.url)`).
- `Lenses.resolveSubject({uri, cid, record}): Resolution` and `Lenses.supportedCollections():
  string[]`, thin over the ABI.
- `fetchRecord(uri, fetchImpl = fetch): Promise<{cid, record}>` resolves did:plc via
  plc.directory and did:web via `/.well-known/did.json`, finds the `#atproto_pds` service,
  calls `com.atproto.repo.getRecord`.
- `buildTag(lenses, {uri, direction, adjective}, fetchImpl?)`: fetches, resolves, and returns
  `{record: <at.isnot.tag record with updatedAt now>, supported: boolean}`. Throws on error.

Built with `vp pack` (dts on). The wasm is copied into `dist/` by the build script and listed
in `files`.

## Go wrapper

`lens.go` embeds `packages/lenses/dist/isnot_lenses.wasm` and instantiates it once with
wazero (pure Go). `resolveSubject(ctx, uri, cid string, record map[string]any)
(resolution, error)` mirrors the ABI; result bytes are copied before `dealloc` because wazero
memory reads alias the module's memory. `lens_test.go` runs every `testdata` fixture.

The wasm is not committed. `scripts/fetch-lenses.sh` reads the version from
`packages/lenses/package.json` and downloads
`https://github.com/jphastings/isnot/releases/download/lenses-v<version>/isnot_lenses.wasm`
into `dist/`. Local development can instead build it with the package's build script. Go
CI and the API Dockerfile run the fetch script before `go build`.

## Build and release

- Package scripts: `build:wasm` runs cargo for `wasm32-unknown-unknown` through the rustup
  toolchain (Homebrew's cargo shadows rustup on JP's Mac; the script sets `RUSTC` and `PATH`
  from `rustup which rustc`) then `wasm-opt -Oz --all-features`; `build` runs `build:wasm`
  then `vp pack`; `test` runs `cargo test` then `vitest`.
- `.github/workflows/lenses.yml` on push and pull request touching `packages/lenses/**`:
  install rust with the wasm target, binaryen, pnpm and vp; build; `cargo test`; `vitest`;
  fetch nothing and run `go test ./...` at the root with the freshly built wasm. On push to
  main it also runs `changesets/action` with `publish: pnpm changeset publish`; after a
  publish it creates the GitHub release `lenses-v<version>` with `isnot_lenses.wasm`
  attached.
- Changesets config at the root; `@is-not/lenses` starts at 0.1.0 with a changeset.

## Testing

Fixtures under `testdata/` are the contract shared by all three runtimes: the Rust tests, the
vitest suite, and `lens_test.go` each run every fixture and compare the full output. Fixtures
today: the real popfeed review record (movie), a popfeed record with `tv_show`, a record of
an unsupported NSID exercising the guess, and a malformed input. Rust unit tests also cover
the finalizer limits (title truncation, identifier cap and sorting).

## Out of scope

The XRPC endpoint that fronts `resolveSubject` (ISNOT-x4bn), any lens beyond popfeed, the
site, and re-verification of lens output against the lexicon in Go (the XRPC layer will do
that with lexval).
