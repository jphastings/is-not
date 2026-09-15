import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vite-plus/test';

vi.mock('$env/dynamic/private', () => ({ env: process.env }));
process.env.SESSIONS_DATABASE_PATH = join(mkdtempSync(join(tmpdir(), 'isnot-sessions-')), 's.db');

describe('browser accounts', () => {
  let s: typeof import('./sessions.ts');
  beforeAll(async () => {
    s = await import('./sessions.ts');
  });

  it('adds, switches and removes accounts', () => {
    const b = s.newBrowser();
    expect(s.getBrowser(b.id)).toEqual({ id: b.id, dids: [], current: null });
    s.addAccount(b.id, 'did:plc:a');
    s.addAccount(b.id, 'did:plc:b');
    expect(s.getBrowser(b.id)).toEqual({
      id: b.id,
      dids: ['did:plc:a', 'did:plc:b'],
      current: 'did:plc:b',
    });
    s.switchAccount(b.id, 'did:plc:a');
    expect(s.getBrowser(b.id)?.current).toBe('did:plc:a');
    s.switchAccount(b.id, 'did:plc:zzz');
    expect(s.getBrowser(b.id)?.current).toBe('did:plc:a');
    s.removeAccount(b.id, 'did:plc:a');
    expect(s.getBrowser(b.id)).toEqual({ id: b.id, dids: ['did:plc:b'], current: 'did:plc:b' });
    s.removeAccount(b.id, 'did:plc:b');
    expect(s.getBrowser(b.id)?.current).toBeNull();
    expect(s.getBrowser('nope')).toBeNull();
  });

  it('stores oauth state and sessions round-trip', async () => {
    await s.stateStore.set('k1', { dpopKey: 'x' } as never);
    expect(await s.stateStore.get('k1')).toEqual({ dpopKey: 'x' });
    await s.stateStore.del('k1');
    expect(await s.stateStore.get('k1')).toBeUndefined();
    await s.sessionStore.set('did:plc:a', { tokenSet: { sub: 'did:plc:a' } } as never);
    expect(await s.sessionStore.get('did:plc:a')).toEqual({ tokenSet: { sub: 'did:plc:a' } });
    await s.sessionStore.del('did:plc:a');
    expect(await s.sessionStore.get('did:plc:a')).toBeUndefined();
  });
});

describe('oauth state', () => {
  it('is a one-shot token that maps back to the browser that started the login', async () => {
    const s = await import('./sessions.ts');
    const b = s.newBrowser();
    const state = s.linkState(b.id);
    expect(state).not.toBe(b.id);
    expect(s.takeState(state)).toBe(b.id);
    expect(s.takeState(state)).toBeNull();
    expect(s.takeState('never-issued')).toBeNull();
  });
});
