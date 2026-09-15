---
# ISNOT-fq9u
title: '/tag page: direction select, adjective typeahead, subject entry'
status: todo
type: feature
priority: normal
created_at: 2026-09-13T16:23:18Z
updated_at: 2026-09-15T21:57:28Z
parent: ISNOT-kgev
---

/tag page: the sentence-shaped form. @who? (login dialog, multi-account), something? (at-uri entry with lens resolution via @is-not/lenses buildReview, manual fallback for unsupported NSIDs), then one or more (direction, adjective) rows: direction styled select 'is really / is / is not / really isn't / ???' (0 shown as ???, see ISNOT-zlhe), adjective typeahead over the XRPC adjective list (client-side filtering/caching). One at.isnot.review record per subject per user: look up the user's existing review for the subject (appview first, PDS listRecords fallback) and update it, setting updatedAt and preserving createdAt, rather than creating a second record.


Done as /review, not /tag: login dialog with multiple accounts, at-uri entry with lens resolution, direction select, and one record per subject that merges and updates rather than creating a second. The subject field also gained a suggestion combobox (ISNOT-x4bn's at.isnot.suggestSubjects).

Still open: the adjective typeahead. The adjective field is a <textarea rows="1"> so the sentence can wrap, and a native <datalist> only binds to <input>, so this needs a real dropdown — reuse SubjectField.svelte's combobox — plus an XRPC endpoint listing adjectives, alongside at.isnot.suggestSubjects in server.go.
