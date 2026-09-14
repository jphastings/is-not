#!/bin/bash
# Container entrypoint: the Go API and the SvelteKit site share one SQLite file.
# If either process ends for any reason the container exits non-zero so Railway
# restarts it.
set -u
trap 'exit 143' INT TERM
trap 'kill -TERM "$api" "$web" 2>/dev/null' EXIT
isnot & api=$!
node /app/web & web=$!
wait -n "$api" "$web"
echo "a process exited; stopping the container" >&2
exit 1
