---
# ISNOT-67a5
title: Narrow the OAuth scope to at.isnot records
status: todo
type: task
priority: high
created_at: 2026-09-15T10:51:02Z
updated_at: 2026-09-15T10:51:02Z
parent: ISNOT-kgev
---

The site asks for 'atproto transition:generic', which grants write access to every collection in the person's repo. We only ever write at.isnot.review.

Blocked on the servers, not on us. On 2026-09-15 all four services we offer advertised the same scopes_supported in their authorization server metadata: atproto, transition:email, transition:generic, transition:chat.bsky. No granular scope is deployed anywhere yet, and putting one in client metadata is reported to break authentication on PDSes that cannot parse it, so requesting one now would lock everyone out.

Watch for scopes_supported gaining repo:* entries, then switch web/src/lib/server/oauth.ts SCOPE to something like:
  atproto repo:at.isnot.review?action=create&action=update&action=delete
Check the final spec for how multiple actions are encoded (proposal 0011 says repeated query parameters; it also says parameter names were not final).

Our own XRPC API is public and unauthenticated, so it needs no rpc scope. If an endpoint ever requires the caller's identity, add rpc:<nsid>?aud=did:web:api.isnot.at alongside.

Changing the scope invalidates existing sessions, so do it when a re-sign-in is acceptable.
