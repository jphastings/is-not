---
# ISNOT-ccxb
title: '/reviews/{did}: list, filter, adjective cloud, inline edit'
status: todo
type: feature
priority: normal
created_at: 2026-09-14T22:26:37Z
updated_at: 2026-09-14T22:26:49Z
parent: ISNOT-kgev
blocked_by:
    - ISNOT-oegf
    - ISNOT-fq9u
---

Page `/reviews/{did}` in web/ listing every at.isnot.review the appview holds for that account. `/reviews/{handle}` resolves the handle and 302s to the DID form; the DID is canonical in metadata. Unknown or empty accounts get a 200 empty state. (Moved out of ISNOT-oegf, which had this as /handle and /did:* profile pages.)

## Listing

- One row per review: subject title (linking to the subject uri), type, and its tags rendered as "is really / is / is not / really isn't / no comment on" + adjective. Direction 0 tags must be shown; the atstore import (ISNOT-tmj5) creates them.
- Filters: subject type (the known values present on this account) and adjective. Filters are URL query params so a view can be linked.
- An adjective cloud above the list: each adjective the account has used, sized by count, click to filter by it. Counts come from review_tags for that did.
- Ordered by updatedAt desc. Paginate only if a real account outgrows one page.

## Editing (own reviews only)

When the signed-in account matches the DID, each review is editable inline: change a tag's direction, remove a tag, add a tag (direction select + adjective typeahead, reusing the /tag page's tag row component and the same BFF write path from ISNOT-fq9u). Saving updates the existing record (updatedAt set, createdAt preserved). Removing the last tag deletes the record, after a confirm. Other people's reviews are read-only; no edit controls rendered.

Blocked by OAuth (ISNOT-oegf) and the /tag page's tag row and write path (ISNOT-fq9u).
