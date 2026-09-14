# is/not

atproto appview for `at.isnot.tag` records. Go API at the root, SvelteKit site in `web/`, lenses in `packages/lenses`.

## Where things are

- Architecture and how to run: `README.md`. Decisions: `docs/superpowers/specs/`. What is done and what is next: `beans list` (epic ISNOT-kgev). Lens authoring: `docs/creating-a-lens.md`.
- The repo is `jphastings/is-not` on GitHub. Nothing is deployed or published yet: `.github/workflows/lenses.yml` needs an `NPM_TOKEN` secret and no lenses release exists, so `scripts/fetch-lenses.sh` has nothing to fetch. Build the wasm locally.
- Deployment: one Railway service from the root `Dockerfile`, declared in `.railway/railway.ts` (see README "Deploying"). Never run `railway config apply` without JP saying so; `railway config plan` is safe.

## Working here

- Commit straight to `main` until GitHub PRs are set up.
- Run `go test ./...` before committing. The smoke test in the ingest plan needs network access.
- Keep this file focused: only things that cost real time, or how development is done here. After each piece of work, check whether it needs updating and make the edit in the same commit.
- Migrations in `migrations/` are append-only once anything is deployed. Until then, editing `001_init.sql` in place is fine.
- The Go build embeds `packages/lenses/dist/isnot_lenses.wasm`, which is git-ignored. Before `go build` or `go test`, either build it (`sh packages/lenses/build-wasm.sh`, needs rustup with the wasm32 target and wasm-opt) or download the released one (`scripts/fetch-lenses.sh`).
- JavaScript lives in a pnpm workspace with Vite+: `pnpm install`, `pnpm test`, `pnpm check`. Package versions use changesets (`pnpm changeset`). The site in `web/` must stay runnable without `node_modules` (adapter-node build, `node:sqlite`, everything in devDependencies) because the runtime image copies only `web/build`.
- Anything that changes what the container needs (new Go embed, new build input, new env var) also changes the `Dockerfile`, `.dockerignore` or `.railway/railway.ts`. `docker build .` is the check (colima on JP's Mac: `colima start`).

## Things that cost time

- Jetstream v2 archive replay is metered and needs `JETSTREAM_API_KEY`; the live tail is free with a 36 hour cursor lookback. See `docs/superpowers/specs/2026-09-13-ingest-design.md`.
- Without an API key, a persisted cursor older than the live lookback window (36 hours) makes the client fail fatally on every restart. Delete the row in the `cursor` table to resume from the live tip, or set `JETSTREAM_API_KEY`.
- Homebrew's cargo shadows rustup on JP's Mac and cannot target wasm32. `build-wasm.sh` forces rustup's toolchain; do the same for any new Rust build step.
- panproto's lens `get` drops ref-typed properties and `remove_field` fails on arrays (bean ISNOT-qvqp). Lenses name identifiers, and titles a step can't reach, in `extensions` instead (see `docs/creating-a-lens.md`).
- `wasm-opt --all-features` lets Binaryen rewrite calls into `call_ref` (the function-references proposal), which wazero's `CoreFeaturesV2` runtime can't instantiate even though Node/V8 accepts it. `build-wasm.sh` pins wasm-opt to wazero's actual supported feature set instead of `--all-features`; keep new Rust/wasm build steps on that same allowlist.
- The runtime image is `node:24-bookworm-slim`, which ships no CA roots; the `Dockerfile` copies `ca-certificates.crt` from the Go stage. Without it the static Go binary fails every TLS dial (jetstream, PLC) while the health check still passes.
- The Docker `rust` image has no toolchain called `stable` (rustup reserves the name and refuses to link one). `build-wasm.sh` takes `RUST_TOOLCHAIN`; the `Dockerfile` passes the image's active toolchain.
