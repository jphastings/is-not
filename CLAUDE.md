# is/not

atproto appview for `at.isnot.tag` records. Go ingester at the root; SvelteKit site will live in `web/`.

## Working here

- Commit straight to `main` until GitHub PRs are set up.
- Run `go test ./...` before committing. The smoke test in the ingest plan needs network access.
- Keep this file focused: only things that cost real time, or how development is done here. After each piece of work, check whether it needs updating and make the edit in the same commit.

## Things that cost time

- Jetstream v2 archive replay is metered and needs `JETSTREAM_API_KEY`; the live tail is free with a 36 hour cursor lookback. See `docs/superpowers/specs/2026-09-13-ingest-design.md`.
- Without an API key, a persisted cursor older than the live lookback window (36 hours) makes the client fail fatally on every restart. Delete the row in the `cursor` table to resume from the live tip, or set `JETSTREAM_API_KEY`.
