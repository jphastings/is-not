import { describe, expect, it, vi } from 'vite-plus/test';

vi.mock('$env/dynamic/private', () => ({ env: process.env }));

describe('publicJwks', () => {
  it('drops every private member and keeps the public ones', async () => {
    const { publicJwks } = await import('./oauth');
    const { keys } = publicJwks({
      keys: [
        { kty: 'EC', crv: 'P-256', x: 'X', y: 'Y', d: 'SECRET', kid: 'key1', use: 'sig' },
        { kty: 'RSA', n: 'N', e: 'E', d: 'S', p: 'P', q: 'Q', dp: 'DP', dq: 'DQ', qi: 'QI' },
      ],
    });
    expect(keys[0]).toEqual({ kty: 'EC', crv: 'P-256', x: 'X', y: 'Y', kid: 'key1', use: 'sig' });
    expect(keys[1]).toEqual({ kty: 'RSA', n: 'N', e: 'E' });
    expect(JSON.stringify(keys)).not.toContain('SECRET');
  });
});
