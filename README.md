# is/not

An [atproto](https://atproto.com) appview for `at.isnot.tag` records: lightweight "X is
adjective" / "X is not adjective" tags that anyone can attach to any atproto record.
Lives at isnot.at, with its API at api.isnot.at.

## Architecture

Two processes share one container and one SQLite file:

- **API (Go, this repo's root):** follows jetstream v2 for `at.isnot.tag` records and folds
  them into SQLite (`tags`, `tag_identifiers`, `accounts`, `cursor`). XRPC endpoints on
  their own port will front the same database. Writes the database.
- **Site (SvelteKit, `web/`, not yet built):** server-renders from the same SQLite file,
  opened read-only, and calls the API for dynamic bits. Signs people in with atproto OAuth
  (several accounts at once) and writes tags to their PDS; the API sees them via jetstream.
- **Lenses (`packages/lenses`):** panproto lens documents describing how a third-party
  record (a popfeed review, a bookhive book, ...) becomes a tag subject. Compiled with the
  panproto engine into one wasm module used by the browser, Node and the Go API. Published
  to npm as `@is-not/lenses`. See `docs/creating-a-lens.md` to add one.

Design decisions are recorded as specs under `docs/superpowers/specs/`, implementation
plans under `docs/superpowers/plans/`. Work is tracked with [beans](https://github.com/hmans/beans)
in `.beans/` (`beans list`).

## Running the API

```sh
sh packages/lenses/build-wasm.sh      # or scripts/fetch-lenses.sh once a release exists
go build ./... && go test ./...
DATABASE_PATH=isnot.db go run .
```

| env var | default | purpose |
|---|---|---|
| `DATABASE_PATH` | `isnot.db` | SQLite file (WAL mode) |
| `JETSTREAM_HOST` | `jetstream.us-east.bsky.network` | jetstream v2 instance |
| `JETSTREAM_API_KEY` | unset | enables metered archive replay so the cursor can resume from any point |

## Working on the lenses package

```sh
pnpm install
pnpm --filter @is-not/lenses build    # wasm via rustup + wasm-opt, then vp pack
pnpm --filter @is-not/lenses test     # cargo test + vitest over the shared fixtures
```

Needs rustup with the `wasm32-unknown-unknown` target and `wasm-opt` (binaryen). The
fixtures in `packages/lenses/testdata/` are the contract shared by the Rust, TypeScript and
Go test suites.

## Lexicon

`lexicons/at/isnot/tag.json`. A tag is a subject (uri, cid, title, type, identifiers), an
adjective of up to 16 graphemes, a direction from -2 to 2, and an update time.
