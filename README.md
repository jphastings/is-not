# is/not

An [atproto](https://atproto.com) appview for `at.isnot.review` records: lightweight "X is
adjective" / "X is not adjective" tags that anyone can attach to any atproto record.
Lives at isnot.at, with its API at api.isnot.at.

## Architecture

Two processes share one container and one SQLite file:

- **API (Go, this repo's root):** follows jetstream v2 for `at.isnot.review` records and folds
  them into SQLite (`reviews`, `review_tags`, `review_identifiers`, `accounts`, `cursor`).
  XRPC endpoints on their own port will front the same database. Writes the database.
- **Site (SvelteKit, `web/`):** server-renders from the same SQLite file, opened read-only
  with Node's built-in `node:sqlite`, and calls the API for dynamic bits. Today it is the
  homepage only; sign-in with atproto OAuth (several accounts at once), the `/tag` page and
  profiles are tracked in beans.
- **Lenses (`packages/lenses`):** panproto lens documents describing how a third-party
  record (a popfeed review, a bookhive book, ...) becomes a tag subject. Compiled with the
  panproto engine into one wasm module used by the browser, Node and the Go API. Published
  to npm as `@is-not/lenses`. See `docs/creating-a-lens.md` to add one.
- **Sentence (`packages/sentence`):** renders an `at.isnot.review` record as a sentence ("X is
  adjective"), in English. Published to npm as `@is-not/sentence`.

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

## Running the site

```sh
pnpm install
pnpm --filter web dev                 # reads ../isnot.db by default; DATABASE_PATH overrides
pnpm --filter web build && WEB_PORT=3000 node web/build
```

The built site reads `WEB_PORT`, `WEB_HOST` and `WEB_ORIGIN` (adapter-node with the `WEB_`
prefix) so it can share a container with the API, which owns `PORT`.

| env var | default | purpose |
|---|---|---|
| `WEB_ORIGIN` | `http://127.0.0.1:5173` | site origin; an `http://127.0.0.1` or `http://localhost` origin uses the atproto OAuth loopback client, any other origin needs `OAUTH_PRIVATE_KEY` |
| `OAUTH_PRIVATE_KEY` | unset | ES256 JWK for OAuth client authentication; generate with `pnpm --filter web keygen`; not needed for loopback development |
| `SESSIONS_DATABASE_PATH` | `web-sessions.db` | SQLite file for browser accounts and OAuth state/sessions |

## Deploying

One Railway service runs both processes from the root `Dockerfile` (`scripts/start.sh` is the
entrypoint) with a volume mounted at `/data` for the SQLite file. The project is declared in
`.railway/railway.ts` ([Railway infrastructure as code](https://docs.railway.com/infrastructure-as-code));
`railway` in the root devDependencies provides its types.

```sh
docker build -t isnot . && docker run --rm -p 8080:8080 -p 3000:3000 -v isnot-data:/data isnot
railway link                          # once: pick or create the Railway project
railway config plan                   # preview; apply when it matches expectations
railway config apply
```

After the first apply: set `JETSTREAM_API_KEY` in the Railway service variables if archive
replay is wanted (the config preserves whatever value is there), and point `isnot.at` and
`api.isnot.at` at the CNAME targets Railway shows for the custom domains. Deploys follow
pushes to `main` on `jphastings/is-not`.

## Packages

- `@is-not/lenses` turns a third-party atproto record into a review subject (panproto lenses compiled to wasm).
- `@is-not/sentence` turns a review record into a sentence, as typed parts, plain text or HTML.

Both are published from `packages/`; the site uses them through the workspace.

## Working on the lenses package

```sh
pnpm install
pnpm --filter @is-not/lenses build    # wasm via rustup + wasm-opt, then vp pack
pnpm --filter @is-not/lenses test     # cargo test + vitest over the shared fixtures
```

Needs rustup with the `wasm32-unknown-unknown` target and `wasm-opt` (binaryen). The
fixtures in `packages/lenses/testdata/` are the contract shared by the Rust, TypeScript and
Go test suites.

## Identity

The project is `did:web:isnot.at`. Its DID document and handle file are static files in
`web/static/.well-known/`, so deploying the site is what makes the identity resolve. The
repo lives on `eurosky.social`, and the `#atproto` key in `did.json` has to match the
signing key that PDS holds for the account, which `com.atproto.identity.getRecommendedDidCredentials`
reports. Do not reach for `com.atproto.server.reserveSigningKey`: a PDS creating a local
account mints a fresh key and ignores reservations, which are only used by entryway
deployments. Being a did:web, the domain is the identity: there are no rotation keys and no
recovery if `isnot.at` is lost.

## Lexicon

`lexicons/at/isnot/review.json`. A review is a subject (uri, cid, title, type, identifiers)
plus one or more tags (an adjective of up to 16 graphemes, and a direction from -2 to 2),
a createdAt and an updatedAt, and an optional locale.

It is published to the network as a `com.atproto.lexicon.schema` record in the project's own
repo, so anyone can resolve `at.isnot.review` without this repository. `_lexicon.isnot.at`
carries the authority DID; the record itself is at
`at://did:web:isnot.at/com.atproto.lexicon.schema/at.isnot.review`. Republish after any edit:

```sh
goat account login -u isnot.at                 # once per machine
goat lex publish ./lexicons
goat lex status ./lexicons                      # green when the network matches the files
```
