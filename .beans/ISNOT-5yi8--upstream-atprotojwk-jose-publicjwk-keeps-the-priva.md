---
# ISNOT-5yi8
title: 'Upstream: @atproto/jwk-jose publicJwk keeps the private key'
status: todo
type: task
priority: high
created_at: 2026-09-15T09:17:14Z
updated_at: 2026-09-15T09:17:14Z
---

JoseKey.publicJwk (and so NodeOAuthClient.jwks) returns the full JWK including 'd' for EC keys, for both JoseKey.generate() and JoseKey.fromImportable(). An app that serves client.jwks at its jwks_uri, as the oauth-client-node README shows, publishes its own signing key. Verified with @atproto/jwk-jose 0.2.4 and @atproto/oauth-client-node 0.5.7 on 2026-09-15.

Reproduce:
  const k = await JoseKey.generate(['ES256'], 'kid');
  'd' in k.publicJwk  // true

Patch: publicJwk should omit the private members for every key type (RSA d,p,q,dp,dq,qi,oth; EC d; OKP d; oct k), the way jose's exportJWK-of-public does. Our web/src/lib/server/oauth.ts now strips them in publicJwks() before serving, so we are not exposed.

JP: this is an upstream repo, so no PR without your say-so. Worth reporting to bluesky-social/atproto.
