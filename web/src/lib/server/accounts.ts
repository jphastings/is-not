import { Agent } from '@atproto/api';
import type { Browser } from './sessions.ts';
import { oauthClient } from './oauth.ts';

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

export async function accountsFor(
  browser: Browser | null,
): Promise<{ accounts: Account[]; current: Account | null }> {
  if (!browser) return { accounts: [], current: null };
  const accounts = await Promise.all(
    browser.dids.map(async (did) => ({ did, handle: await didHandle(did) })),
  );
  return { accounts, current: accounts.find((a) => a.did === browser.current) ?? null };
}

export async function agentFor(did: string): Promise<Agent> {
  const session = await (await oauthClient()).restore(did);
  return new Agent(session);
}
