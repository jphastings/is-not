---
# ISNOT-q70n
title: Record failed subject resolutions so the backfill stops retrying them every boot
status: todo
type: task
created_at: 2026-09-17T12:19:23Z
updated_at: 2026-09-17T12:19:23Z
parent: ISNOT-kgev
---

The startup backfill (`ingest.go`'s `backfillSubjects`) selects every distinct `subject_uri` in `reviews` with no `subjects` row. A subject that resolves is written and never looked at again, but one that cannot resolve — no lens for its collection, a dead or unreachable PDS, a deleted record, or a lens that can only name it by its uri — leaves no trace, so it is fetched again on every boot. On a deployed appview that is one wasted fetch per unlensable subject per deploy, and it grows with every review of an unsupported collection.

Record the failure instead: a negative marker (a `subjects` row flagged unresolved, or a small `subject_failures` table with the uri, a reason and a timestamp) that the backfill's query excludes, with some way back in when a lens is added or the subject changes cid — a new review naming the subject already refetches through `resolveSubjects`, so the marker only needs to gate the backfill.
