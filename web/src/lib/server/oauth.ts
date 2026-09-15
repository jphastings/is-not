import { NodeOAuthClient, atprotoLoopbackClientMetadata } from '@atproto/oauth-client-node';
import { JoseKey } from '@atproto/jwk-jose';
import { env } from '$env/dynamic/private';
import { sessionStore, stateStore } from './sessions.ts';

// The least privilege the network actually grants today. Every PDS we checked
// (bsky.social, eurosky.social, blacksky.app, northsky.social) advertises only
// atproto and the transition:* scopes, so writing records needs transition:generic.
// Narrow this to at.isnot records the moment servers support it: bean ISNOT-67a5.
const SCOPE = 'atproto transition:generic';
let client: Promise<NodeOAuthClient> | undefined;

export function origin(): string {
  return (env.WEB_ORIGIN ?? 'http://127.0.0.1:5173').replace(/\/$/, '');
}

export function oauthClient(): Promise<NodeOAuthClient> {
  return (client ??= build());
}

async function build(): Promise<NodeOAuthClient> {
  const o = origin();
  const redirect = `${o}/oauth/callback`;
  if (/^http:\/\/localhost(:\d+)?$/.test(o)) {
    throw new Error(
      'WEB_ORIGIN must use 127.0.0.1 rather than localhost: an atproto loopback client id may not name localhost (RFC 8252). Browse the dev server at 127.0.0.1 too, so the cookie and the redirect share a host.',
    );
  }
  if (/^http:\/\/127\.0\.0\.1(:\d+)?$/.test(o)) {
    const clientId = `http://localhost?${new URLSearchParams({ redirect_uri: redirect, scope: SCOPE })}`;
    return new NodeOAuthClient({
      clientMetadata: atprotoLoopbackClientMetadata(clientId),
      stateStore,
      sessionStore,
    });
  }
  if (!env.OAUTH_PRIVATE_KEY)
    throw new Error('OAUTH_PRIVATE_KEY is required when WEB_ORIGIN is not a loopback address');
  return new NodeOAuthClient({
    clientMetadata: {
      client_id: `${o}/oauth-client-metadata.json`,
      client_name: 'is/not',
      client_uri: o,
      redirect_uris: [redirect],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      scope: SCOPE,
      application_type: 'web',
      token_endpoint_auth_method: 'private_key_jwt',
      token_endpoint_auth_signing_alg: 'ES256',
      dpop_bound_access_tokens: true,
      jwks_uri: `${o}/oauth/jwks.json`,
    },
    keyset: [await JoseKey.fromImportable(env.OAUTH_PRIVATE_KEY, 'key1')],
    stateStore,
    sessionStore,
  });
}

// RFC 7517/7518 private members, by key type: RSA, EC and OKP, and oct.
const PRIVATE_MEMBERS = ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth', 'k'];

/**
 * The keyset's own jwks still carries the private members, so publishing it
 * verbatim would hand out the signing key. Strip them before serving.
 */
export function publicJwks(jwks: { readonly keys: readonly Readonly<object>[] }): {
  keys: Record<string, unknown>[];
} {
  return {
    keys: jwks.keys.map((key) => {
      const pub: Record<string, unknown> = { ...key };
      for (const member of PRIVATE_MEMBERS) delete pub[member];
      return pub;
    }),
  };
}
