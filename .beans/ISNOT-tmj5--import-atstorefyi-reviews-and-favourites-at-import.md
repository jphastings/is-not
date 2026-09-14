---
# ISNOT-tmj5
title: Import atstore.fyi reviews and favourites at /import/atstore.fyi
status: todo
type: feature
created_at: 2026-09-14T22:26:37Z
updated_at: 2026-09-14T22:26:37Z
parent: ISNOT-kgev
blocked_by:
    - ISNOT-oegf
    - ISNOT-fq9u
    - ISNOT-x4bn
---

Page `/import/atstore.fyi` in web/. Requires a signed-in account; if none, show the same login dialog as the main page. Imports the signed-in account's `fyi.atstore.listing.review` and `fyi.atstore.listing.favorite` records as `at.isnot.review` records.

## Mapping

Read both collections from the user's PDS with `com.atproto.repo.listRecords` (paginate; the sample account has 8 reviews and 16 favourites).

- `fyi.atstore.listing.favorite` → tag `{ adjective: "awesome", direction: 2 }`.
- `fyi.atstore.listing.review` → tag `{ adjective: "good", direction: rating - 3 }` (1★ → -2, 5★ → 2). A 3★ review is imported as an explicit 0. The review `text` is dropped (at.isnot.review has no text field).
- Subject: the `fyi.atstore.listing.detail` record at `.subject`, via at.isnot.resolveSubject. Needs a new lens `fyi.atstore.listing.detail` in packages/lenses: `name` → title, type `app` (the existing `fyi.atstore.listing.review` lens is for tagging a review itself, not for this). Add it to the lenses with a fixture in testdata. Subject cid is the detail record's current cid.
- Both collections group by subject. An app that is favourited and reviewed becomes one at.isnot.review with two tags. If the user already has an at.isnot.review for that subject (lookup as in ISNOT-fq9u: appview first, PDS listRecords fallback), merge the imported tags into it and set updatedAt; otherwise create it with createdAt = the earliest source record's createdAt.

Examples: `at://did:plc:ephkzpinhaqcabtkugtbzrwu/fyi.atstore.listing.review/3muy6h3mwackp` (5★ of rpg.actor), `at://did:plc:ephkzpinhaqcabtkugtbzrwu/fyi.atstore.listing.favorite/f651fc7f-3691-454c-af25-3fa22eb11f9a` (Currents).

## UX

Preview then confirm: a table of every subject with the resolved app name, the source record(s), and the tags that will be written, each row with a checkbox (all on by default). Rows whose subject already has an at.isnot.review are marked "update". One Import button writes the checked rows through the same BFF write path as /tag and reports per-row success or failure. Re-running the import is idempotent. Subjects whose detail record cannot be fetched (deleted listing, PDS down) are shown unchecked with the error and can't be selected.

Blocked by OAuth (ISNOT-oegf), the review write/lookup path (ISNOT-fq9u) and resolveSubject (ISNOT-x4bn).
