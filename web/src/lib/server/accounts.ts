import { resolveTxt } from 'node:dns/promises';
import { Agent } from '@atproto/api';
import type { OAuthSession } from '@atproto/oauth-client-node';
import { oauthClient } from './oauth.ts';
import { removeAccount, type Browser } from './sessions.ts';

export type Account = { did: string; handle: string };

export async function didHandle(did: string): Promise<string> {
  const url = did.startsWith('did:web:')
    ? `https://${did.slice(8)}/.well-known/did.json`
    : `https://plc.directory/${did}`;
  try {
    const doc = (await (await fetch(url)).json()) as { alsoKnownAs?: string[] };
    return doc.alsoKnownAs?.find((a) => a.startsWith('at://'))?.slice(5) ?? '';
  } catch {
    return '';
  }
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
