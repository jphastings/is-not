---
# ISNOT-fq9u
title: '/tag page: direction select, adjective typeahead, subject entry'
status: todo
type: feature
priority: normal
created_at: 2026-09-13T16:23:18Z
updated_at: 2026-09-14T22:17:49Z
parent: ISNOT-kgev
---

/tag page: the sentence-shaped form. @who? (login dialog, multi-account), something? (at-uri entry with lens resolution via @is-not/lenses buildReview, manual fallback for unsupported NSIDs), then one or more (direction, adjective) rows: direction styled select 'is really / is / is not / really isn't' (0 hidden), adjective typeahead over the XRPC adjective list (client-side filtering/caching). One at.isnot.review record per subject per user: look up the user's existing review for the subject (appview first, PDS listRecords fallback) and update it, setting updatedAt and preserving createdAt, rather than creating a second record.
