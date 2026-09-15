---
# ISNOT-67a5
title: Narrow the OAuth scope to at.isnot records
status: todo
type: task
priority: high
created_at: 2026-09-15T10:51:02Z
updated_at: 2026-09-15T12:23:55Z
parent: ISNOT-kgev
---

The site now asks for 'atproto repo:at.isnot.review?action=create&action=update&action=delete' instead of transition:generic, so it can only touch its own records. JP chose to ship this before servers support it.

What is verified (2026-09-15): the pushed authorization request is ACCEPTED by eurosky.social with this scope, and the sign-in page renders normally with the identifier filled in. That was not expected; the scope is not advertised in scopes_supported on any of bsky.social, eurosky.social, blacksky.app or northsky.social.

What is NOT verified: everything past the password prompt. Whether the server shows sensible consent text for a scope it does not advertise, whether the token exchange succeeds, and whether a granted session can actually write an at.isnot.review record. Signing in once answers all three.

If it turns out the scope is rejected or silently ignored: revert SCOPE in web/src/lib/server/oauth.ts to 'atproto transition:generic' (one line) and redeploy. A session already granted under the old scope reads as signed out rather than failing every save, so the fallback is clean.

Our own XRPC API is public and unauthenticated, so no rpc: scope is needed. Add rpc:<nsid>?aud=did:web:api.isnot.at if an endpoint ever needs the caller's identity.
