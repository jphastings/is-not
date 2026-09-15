---
# ISNOT-iik2
title: Sign in with a PDS other than bsky.social
status: todo
type: task
priority: normal
created_at: 2026-09-15T00:44:22Z
updated_at: 2026-09-15T00:44:22Z
parent: ISNOT-kgev
---

The /review sign-in slot posts to /oauth/login with no handle, so the OAuth client authorizes against the bsky.social entryway. Anyone whose account lives on another PDS cannot sign in: no surface collects a handle. Options: a handle prompt behind the same slot (click to type, Enter to sign in), or a 'somewhere else?' link beside it. The route already accepts a handle form field, so only the UI is missing.
