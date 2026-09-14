# is/not

atproto appview for `at.isnot.tag` records. Go ingester at the root; SvelteKit site will live in `web/`.

## Working here

- Commit straight to `main` until GitHub PRs are set up.
- Run `go test ./...` before committing. The smoke test in the ingest plan needs network access.
- Keep this file focused: only things that cost real time, or how development is done here. After each piece of work, check whether it needs updating and make the edit in the same commit.
- Migrations in `migrations/` are append-only once anything is deployed. Until then, editing `001_init.sql` in place is fine.
- The Go build embeds `packages/lenses/dist/isnot_lenses.wasm`, which is git-ignored. Before `go build` or `go test`, either build it (`sh packages/lenses/build-wasm.sh`, needs rustup with the wasm32 target and wasm-opt) or download the released one (`scripts/fetch-lenses.sh`).
- JavaScript lives in a pnpm workspace with Vite+: `pnpm install`, `pnpm test`, `pnpm check`. Package versions use changesets (`pnpm changeset`).

## Things that cost time

- Jetstream v2 archive replay is metered and needs `JETSTREAM_API_KEY`; the live tail is free with a 36 hour cursor lookback. See `docs/superpowers/specs/2026-09-13-ingest-design.md`.
- Without an API key, a persisted cursor older than the live lookback window (36 hours) makes the client fail fatally on every restart. Delete the row in the `cursor` table to resume from the live tip, or set `JETSTREAM_API_KEY`.
- Homebrew's cargo shadows rustup on JP's Mac and cannot target wasm32. `build-wasm.sh` forces rustup's toolchain; do the same for any new Rust build step.
- panproto's lens `get` drops ref-typed properties and `remove_field` fails on arrays (bean ISNOT-qvqp). Lenses name identifiers in `extensions` instead.
- `wasm-opt --all-features` lets Binaryen rewrite calls into `call_ref` (the function-references proposal), which wazero's `CoreFeaturesV2` runtime can't instantiate even though Node/V8 accepts it. `build-wasm.sh` pins wasm-opt to wazero's actual supported feature set instead of `--all-features`; keep new Rust/wasm build steps on that same allowlist.
