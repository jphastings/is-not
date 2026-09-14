---
# ISNOT-jqpi
title: 'Railway release: Dockerfile, IaC, health endpoint, homepage'
status: completed
type: task
priority: normal
created_at: 2026-09-14T20:57:20Z
updated_at: 2026-09-14T21:04:51Z
parent: ISNOT-kgev
---

One Railway service from the root Dockerfile running the Go API (PORT, /xrpc/_health) and the SvelteKit site (WEB_PORT) on one SQLite file under a /data volume, declared in .railway/railway.ts. Includes the first web/ scaffold: homepage rotating random tags read via node:sqlite. Remaining before going live: railway link + config apply (JP), DNS for isnot.at and api.isnot.at, JETSTREAM_API_KEY variable, NPM_TOKEN secret for the lenses workflow.
