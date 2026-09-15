---
# ISNOT-6s6n
title: Translate the authManageReviews permission set
status: todo
type: task
priority: low
created_at: 2026-09-15T12:45:35Z
updated_at: 2026-09-15T12:45:35Z
parent: ISNOT-kgev
---

`lexicons/at/isnot/authManageReviews.json` carries an English `title` and `detail` only. Those two strings are what a PDS shows on the consent screen, so a non-English speaker is asked to approve something they cannot read.

A permission-set def takes `title:lang` and `detail:lang` objects keyed by language tag (`{"fr": "...", "de": "..."}`) alongside the plain fields, which stay as the fallback. `app.bsky.authManageProfile` is the shape to copy.

Wait until the site's own message catalogue has languages worth matching — translating the consent screen before the site itself is translated buys nothing. Whichever languages paraglide ends up carrying are the ones to put here.

Editing the file changes nothing for any PDS on its own: `goat lex publish ./lexicons` has to run afterwards.
