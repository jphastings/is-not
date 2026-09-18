import { resolveTxt } from 'node:dns/promises';
import { Agent } from '@atproto/api';
import type { OAuthSession } from '@atproto/oauth-client-node';
import { guardedFetchJson } from './canonical.ts';
import { oauthClient } from './oauth.ts';
import { removeAccount, type Browser } from './sessions.ts';

export type Account = { did: string; handle: string };

export type DidDoc = {
  alsoKnownAs?: string[];
  service?: { id?: string; type?: string; serviceEndpoint?: string }[];
};

/** The DID document itself, for callers that need more than the handle —
    e.g. the live-review PDS fallback needs the `#atproto_pds` service
    endpoint. Same two resolution methods `didHandle` builds on. A did:web
    document lives at a host its own owner picks, so that branch goes
    through the same guarded fetch a PDS endpoint does; plc.directory is a
    fixed, trusted host and stays on a bare `fetch`. */
export async function resolveDidDoc(did: string, signal?: AbortSignal): Promise<DidDoc | null> {
  if (did.startsWith('did:web:')) {
    const doc = await guardedFetchJson(`https://${did.slice(8)}/.well-known/did.json`, signal);
    return typeof doc === 'object' && doc !== null ? (doc as DidDoc) : null;
  }
  try {
    return (await (await fetch(`https://plc.directory/${did}`, { signal })).json()) as DidDoc;
  } catch {
    return null;
  }
}

export function docHandle(doc: DidDoc | null): string {
  return doc?.alsoKnownAs?.find((a) => a.startsWith('at://'))?.slice(5) ?? '';
}

export async function didHandle(did: string): Promise<string> {
  return docHandle(await resolveDidDoc(did));
}

/**
 * Resolves a handle to its DID, per the atproto handle resolution spec: the DNS
 * TXT method first, then the HTTPS well-known fallback. Returns null when
 * neither method resolves.
 */
export async function handleDid(handle: string): Promise<string | null> {
  try {
    const records = await resolveTxt(`_atproto.${handle}`);
    const did = records
      .flat()
      .find((r) => r.startsWith('did='))
      ?.slice(4);
    if (did) return did;
  } catch {
    // fall through to the HTTPS method
  }
  try {
    const res = await fetch(`https://${handle}/.well-known/atproto-did`);
    const text = (await res.text()).trim();
    return res.ok && text.startsWith('did:') ? text : null;
  } catch {
    return null;
  }
}

/** The session for a DID, or null when it can no longer be restored. */
export async function sessionFor(did: string): Promise<OAuthSession | null> {
  try {
    return await (await oauthClient()).restore(did);
  } catch {
    return null;
  }
}

/**
 * A session the PDS will no longer honour, because it was revoked or because
 * the scope we ask for changed, must read as signed out rather than as an
 * account whose every save fails.
 */
export async function accountsFor(
  browser: Browser | null,
): Promise<{ accounts: Account[]; current: Account | null }> {
  if (!browser) return { accounts: [], current: null };

  const restored = await Promise.all(
    browser.dids.map(async (did) => ({ did, session: await sessionFor(did) })),
  );

  let current = browser.current;
  for (const { did, session } of restored) {
    if (session) continue;
    current = removeAccount(browser.id, did).current;
  }

  const accounts = await Promise.all(
    restored
      .filter(({ session }) => session !== null)
      .map(async ({ did }) => ({ did, handle: await didHandle(did) })),
  );
  return { accounts, current: accounts.find((a) => a.did === current) ?? null };
}

export async function agentFor(did: string): Promise<Agent | null> {
  const session = await sessionFor(did);
  return session ? new Agent(session) : null;
}

// ponytail: process-lifetime cache, no TTL
const avatarCache = new Map<string, Promise<string | null>>();

export function avatarFor(did: string): Promise<string | null> {
  const cached = avatarCache.get(did);
  if (cached) return cached;

  const promise = (async () => {
    try {
      const res = await fetch(
        `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`,
        { signal: AbortSignal.timeout(5000) },
      );
      const profile = (await res.json()) as { avatar?: unknown };
      return typeof profile.avatar === 'string' ? profile.avatar : null;
    } catch {
      return null;
    }
  })();

  // A transient failure or a not-yet-set avatar shouldn't stick for the process lifetime.
  promise.then(
    (result) => {
      if (!result) avatarCache.delete(did);
    },
    () => avatarCache.delete(did),
  );

  avatarCache.set(did, promise);
  return promise;
}
