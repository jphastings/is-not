---
# ISNOT-x4bn
title: 'Go XRPC API: resolveSubject, adjective typeahead, container'
status: todo
type: feature
created_at: 2026-09-13T16:23:18Z
updated_at: 2026-09-13T16:23:18Z
parent: ISNOT-kgev
---

XRPC endpoints via atmos xrpcserver on its own port (api.isnot.at): at.isnot.resolveSubject (resolve DID -> PDS, getRecord, run lenses wasm via wazero; unsupported NSID returns best-guess + unsupported flag), adjective typeahead returning a large list (user's most used + ecosystem most popular) for client-side filtering/caching, random tags sample for the homepage. Dockerfile for the API.

Notes from the subject/accounts review (2026-09-13): subject metadata is per-tag and unnormalised, so any aggregate view of one subject_uri needs a canonical rule for title/type/identifiers (e.g. most recent by updated_at) decided in this spec. subject_identifiers is unindexed JSON text; add a generated column or side table when identifier matching is needed. Add an index on tags(updated_at) with the first recent-tags feed. Keep the invariant that nothing queries the DB inside the fold transaction (SetMaxOpenConns(1)); an XRPC read pool must not change that.
