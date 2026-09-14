---
# ISNOT-k0xw
title: Go live on Railway
status: todo
type: task
priority: high
created_at: 2026-09-14T21:04:51Z
updated_at: 2026-09-14T21:04:51Z
parent: ISNOT-kgev
---

Manual steps once the code is pushed: 'railway link' (create the project in the byJP workspace), 'railway config plan' then 'railway config apply' from the repo root; add the JETSTREAM_API_KEY service variable if archive replay is wanted; point isnot.at and api.isnot.at DNS at the CNAME targets Railway shows; on npmjs.com add a trusted publisher for @is-not/lenses (GitHub Actions, user jphastings, repo is-not, workflow lenses.yml, no environment) so the lenses workflow can publish. Then check /xrpc/_health on api.isnot.at and the homepage on isnot.at.
