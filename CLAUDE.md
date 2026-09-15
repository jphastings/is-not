# is/not

atproto appview for `at.isnot.review` records. Go API at the root, SvelteKit site in `web/`, lenses in `packages/lenses`.

## Where things are

- Architecture and how to run: `README.md`. Decisions: `docs/superpowers/specs/`. What is done and what is next: `beans list` (epic ISNOT-kgev). Lens authoring: `docs/creating-a-lens.md`.
- The repo is `jphastings/is-not` on GitHub. The site is live at `isnot.at` and the API at `api.isnot.at`; `@is-not/lenses` is not published yet. `.github/workflows/lenses.yml` publishes both `@is-not/lenses` and `@is-not/sentence` with npm trusted publishing (no token). Every package needs its own trusted publisher on npmjs.com naming this repo and `lenses.yml`, allowing the `npm publish` action; a missing publisher answers 404 on the PUT and a disallowed action answers 403 "OIDC permission denied". Don't rename that workflow file: the publisher configs name it. A package's very first version has to be published by hand, because a publisher can only be attached to a package that exists once a version PR is merged; until the first release exists `scripts/fetch-lenses.sh` has nothing to fetch, so build the wasm locally. Trusted publishing only works once a package's first version already exists on npm: for any new package (`@is-not/sentence` included), JP publishes that first version by hand (`pnpm publish` in the package dir) before CI can take over.
- Deployment: one Railway service from the root `Dockerfile`, declared in `.railway/railway.ts` (see README "Deploying"). Never run `railway config apply` without JP saying so; `railway config plan` is safe. Custom domains cannot be declared in the IaC file: add them in the dashboard and `railway config pull` them in.
- The project's atproto identity is `did:web:isnot.at`, served from `web/static/.well-known/` (`did.json` and `atproto-did`). The repo lives on `eurosky.social`, and the `#atproto` key in `did.json` must match the signing key that PDS holds for the account (`com.atproto.identity.getRecommendedDidCredentials` reports it), so moving PDS means editing `did.json` in the same change. `com.atproto.server.reserveSigningKey` is a dead end here: creating a local account mints a fresh key and ignores reservations. `web/static/.well-known/` survives the build because sirv makes an explicit exception for `.well-known` under its no-dotfiles rule.

## Working here

- Commit straight to `main` until GitHub PRs are set up.
- Run `go test ./...` before committing. The smoke test in the ingest plan needs network access.
- Keep this file focused: only things that cost real time, or how development is done here. After each piece of work, check whether it needs updating and make the edit in the same commit.
- Migrations in `migrations/` are append-only once anything is deployed. Until then, editing `001_init.sql` in place is fine.
- Editing a file in `lexicons/` changes nothing for anyone else until it is republished as a `com.atproto.lexicon.schema` record: `goat account login -u isnot.at`, then `goat lex publish ./lexicons`. `goat lex status ./lexicons` says whether the network matches the files, `goat lex check-dns ./lexicons` checks `_lexicon.isnot.at` resolves, and `goat lex breaking` checks an edit against the evolution rules before it goes out.
- The Go build embeds `packages/lenses/dist/isnot_lenses.wasm`, which is git-ignored. Before `go build` or `go test`, either build it (`sh packages/lenses/build-wasm.sh`, needs rustup with the wasm32 target and wasm-opt) or download the released one (`scripts/fetch-lenses.sh`).
- The site's design context is `PRODUCT.md` and `DESIGN.md` at the repo root (impeccable); read them before changing how anything looks.
- JavaScript lives in a pnpm workspace with Vite+: `pnpm install`, `pnpm test`, `pnpm check` (oxlint and oxfmt, configured in the root `vite.config.ts`; no prettier, eslint or biome). oxfmt does not format `.svelte` files; `pnpm --filter web check` type-checks them. Package versions use changesets (`pnpm changeset`). The site in `web/` must stay runnable without `node_modules` (adapter-node build, `node:sqlite`, everything in devDependencies) because the runtime image copies only `web/build`.
- Anything that changes what the container needs (new Go embed, new build input, new env var) also changes the `Dockerfile`, `.dockerignore` or `.railway/railway.ts`. `docker build .` is the check (colima on JP's Mac: `colima start`).

## Things that cost time

- Jetstream v2 archive replay is metered and needs `JETSTREAM_API_KEY`; the live tail is free with a 36 hour cursor lookback. See `docs/superpowers/specs/2026-09-13-ingest-design.md`.
- Without an API key, a persisted cursor older than the live lookback window (36 hours) makes the client fail fatally on every restart. Delete the row in the `cursor` table to resume from the live tip, or set `JETSTREAM_API_KEY`.
- Homebrew's cargo shadows rustup on JP's Mac and cannot target wasm32. `build-wasm.sh` forces rustup's toolchain; do the same for any new Rust build step.
- panproto's lens `get` drops ref-typed properties and `remove_field` fails on arrays (bean ISNOT-qvqp). Lenses name identifiers, and titles a step can't reach, in `extensions` instead (see `docs/creating-a-lens.md`).
- `wasm-opt --all-features` lets Binaryen rewrite calls into `call_ref` (the function-references proposal), which wazero's `CoreFeaturesV2` runtime can't instantiate even though Node/V8 accepts it. `build-wasm.sh` pins wasm-opt to wazero's actual supported feature set instead of `--all-features`; keep new Rust/wasm build steps on that same allowlist.
- The runtime image is `node:24-bookworm-slim`, which ships no CA roots; the `Dockerfile` copies `ca-certificates.crt` from the Go stage. Without it the static Go binary fails every TLS dial (jetstream, PLC) while the health check still passes.
- The Docker `rust` image has no toolchain called `stable` (rustup reserves the name and refuses to link one). `build-wasm.sh` takes `RUST_TOOLCHAIN`; the `Dockerfile` passes the image's active toolchain.
- Paraglide generates `web/src/lib/paraglide/` at build time, so a new message key only type-checks after `pnpm --filter web build` (or a dev server run).
- A `<select>` is always as wide as its widest option, and an `<input>`'s intrinsic width comes from its `size` attribute. `ReviewForm.svelte` sizes both to their current value with a hidden twin (`.autosize`): inputs need `size="1"`, and the select has to be taken out of grid sizing with `position: absolute`.
