---
# ISNOT-qvqp
title: 'Upstream: panproto lens get drops ref-typed properties'
status: todo
type: bug
created_at: 2026-09-13T15:37:38Z
updated_at: 2026-09-13T15:37:38Z
---

Observed with panproto 0.74.2 (Rust crates and, by extension, @panproto/core), in a spike on 2026-09-13.

Repro: parse the official social.popfeed.feed.review lexicon with `atproto::parse_lexicon`, parse a record with `inst::parse_json(schema, "social.popfeed.feed.review:body", record)`. `inst::to_json` of the parsed instance includes `identifiers` (a property whose type is `ref: "#identifiers"`). Apply a lens with an empty `steps` array via `lens::get`: the view omits `identifiers`. A `hoist_field` with parent `social.popfeed.feed.review:body`, intermediate `identifiers`, child `imdbId` is a silent no-op.

Also: `{"remove_field": "genres"}` on an array property fails with "no edge found between ...:body and ...:body.genres:items in target schema".

Likely cause: `wtype_restrict` does not follow the nameless `ref` indirection edge that `panproto-inst` treats as transparent (see `is_transparent_indirection` in panproto-inst/src/parse.rs).

Decision needed from JP: report upstream (never open PRs outside jphastings without permission). Until fixed, isnot lenses cannot project fields under ref-typed defs; the workaround is a lens `extensions` entry the finalizer honours.
