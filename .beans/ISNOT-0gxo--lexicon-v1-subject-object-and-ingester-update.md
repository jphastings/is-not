---
# ISNOT-0gxo
title: Lexicon v1 subject object and ingester update
status: in-progress
type: feature
created_at: 2026-09-13T16:23:18Z
updated_at: 2026-09-13T16:23:18Z
parent: ISNOT-kgev
---

Rewrite at.isnot.tag so subject is a #subject object (uri, cid, title, type, identifiers[]). Title max 256 graphemes / 2560 bytes. Type knownValues: movie, tv-series, tv-episode, book, album, post. Ingester: tags table gains subject_title, subject_type, subject_identifiers (JSON); rewrite migration 001 in place (nothing deployed yet). New accounts table (did, handle) resolved at ingest via atmos identity and updated from jetstream identity events.
