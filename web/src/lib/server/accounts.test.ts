import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vite-plus/test';

vi.mock('$env/dynamic/private', () => ({ env: process.env }));
vi.mock('node:dns/promises', () => ({
  resolveTxt: async (name: string) => {
    if (name === '_atproto.dns.example') return [['did=did:plc:dns']];
    throw new Error('no TXT record');
  },
}));
vi.mock('./oauth.ts', () => ({
  origin: () => 'https://isnot.at',
  oauthClient: async () => ({
    restore: async (did: string) => {
      if (did === 'did:plc:revoked') throw new Error('session is gone');
      return { did };
    },
  }),
}));

process.env.SESSIONS_DATABASE_PATH = join(mkdtempSync(join(tmpdir(), 'isnot-accounts-')), 's.db');
vi.stubGlobal('fetch', async () => Response.json({ alsoKnownAs: ['at://alive.example'] }));

describe('accountsFor', () => {
  it('drops an account whose session no longer restores, and forgets it', async () => {
    const sessions = await import('./sessions.ts');
    const { accountsFor } = await import('./accounts.ts');
    const browser = sessions.newBrowser();
    sessions.addAccount(browser.id, 'did:plc:alive');
    sessions.addAccount(browser.id, 'did:plc:revoked');

    const result = await accountsFor(sessions.getBrowser(browser.id));

    expect(result.accounts).toEqual([{ did: 'did:plc:alive', handle: 'alive.example' }]);
    expect(result.current?.did).toBe('did:plc:alive');
    expect(sessions.getBrowser(browser.id)?.dids).toEqual(['did:plc:alive']);
  });

  it('has no accounts when nobody is signed in', async () => {
    const { accountsFor } = await import('./accounts.ts');
    expect(await accountsFor(null)).toEqual({ accounts: [], current: null });
  });
});

describe('handleDid', () => {
  it('resolves via the DNS TXT method first', async () => {
    const { handleDid } = await import('./accounts.ts');
    expect(await handleDid('dns.example')).toBe('did:plc:dns');
  });

  it('falls back to the HTTPS well-known method when DNS has no record', async () => {
    vi.stubGlobal('fetch', async () => new Response('did:plc:https\n'));
    const { handleDid } = await import('./accounts.ts');
    expect(await handleDid('https.example')).toBe('did:plc:https');
  });

  it('returns null when neither method resolves', async () => {
    vi.stubGlobal('fetch', async () => new Response('not found', { status: 404 }));
    const { handleDid } = await import('./accounts.ts');
    expect(await handleDid('nobody.example')).toBeNull();
  });
});
