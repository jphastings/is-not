---
# ISNOT-zlhe
title: 'Direction 0 in the tag editor: ''???'' option with explanatory text'
status: todo
type: feature
created_at: 2026-09-14T22:31:39Z
updated_at: 2026-09-14T22:31:39Z
parent: ISNOT-kgev
blocked_by:
    - ISNOT-fq9u
---

The direction select on the /tag page (ISNOT-fq9u) and the inline tag editor on /reviews/{did} (ISNOT-ccxb) include direction 0. Its option text is the literal `???`, so the sentence reads "thing ??? good" rather than "thing is good".

When `???` is selected, small text appears directly under the tag row: "This declares that you're making no comment about whether <thing> is or is not <adjective>." with the subject title and the current adjective substituted (fall back to "this" / "that" while either is empty). It disappears when another direction is chosen.

The same `???` wording is used wherever a tag with direction 0 is rendered read-only (review listings, the homepage sample), so the atstore import's 3★ reviews (ISNOT-tmj5) read consistently everywhere.
