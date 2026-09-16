import { describe, expect, it, vi } from 'vite-plus/test';
import { reviewRkey } from './rkey.ts';

// Independently verified: hashlib.sha256(subject_uri.encode()).digest(), prefixed
// with b'\x12\x20', then a hand-rolled base58 (Bitcoin alphabet) encode.
const SUBJECT_URI = 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.post/3kkxbpjfqvs2b';
const EXPECTED_RKEY = 'QmWqZBU7ThesgwiEMgqBPqoZrw841NzDNveMD7MunahiA6';

describe('reviewRkey', () => {
  it('matches an independently computed test vector', () => {
    expect(reviewRkey(SUBJECT_URI)).toBe(EXPECTED_RKEY);
  });

  it('is a 46-character CIDv0-shaped string', () => {
    const rkey = reviewRkey(SUBJECT_URI);
    expect(rkey).toHaveLength(46);
    expect(rkey.startsWith('Qm')).toBe(true);
  });

  it('is deterministic for the same subject and differs for another', () => {
    expect(reviewRkey(SUBJECT_URI)).toBe(reviewRkey(SUBJECT_URI));
    expect(reviewRkey(SUBJECT_URI)).not.toBe(reviewRkey(`${SUBJECT_URI}x`));
  });
});

vi.mock('./accounts.ts', () => ({
  handleDid: async (handle: string) => (handle === 'alive.example' ? 'did:plc:alive' : null),
}));

describe('normaliseSubjectUri', () => {
  it('leaves a did-authority uri unchanged, trimmed', async () => {
    const { normaliseSubjectUri } = await import('./rkey.ts');
    expect(await normaliseSubjectUri(`  ${SUBJECT_URI}  `)).toBe(SUBJECT_URI);
  });

  it('resolves a handle authority to its did', async () => {
    const { normaliseSubjectUri } = await import('./rkey.ts');
    expect(await normaliseSubjectUri('at://alive.example/app.bsky.feed.post/abc')).toBe(
      'at://did:plc:alive/app.bsky.feed.post/abc',
    );
  });

  it('returns null when the handle cannot be resolved', async () => {
    const { normaliseSubjectUri } = await import('./rkey.ts');
    expect(await normaliseSubjectUri('at://dead.example/app.bsky.feed.post/abc')).toBeNull();
  });

  it('returns null for a malformed uri', async () => {
    const { normaliseSubjectUri } = await import('./rkey.ts');
    expect(await normaliseSubjectUri('not-an-at-uri')).toBeNull();
  });
});
