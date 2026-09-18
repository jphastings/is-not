import { describe, expect, it, vi } from 'vite-plus/test';

const validRecord = {
  subject: {
    uri: 'at://did:plc:x/app.bsky.feed.post/1',
    cid: 'bafy1',
    title: 'a sandwich',
    type: 'post',
  },
  tags: [{ adjective: 'crunchy', direction: 1 }],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

vi.mock('./accounts.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./accounts.ts')>();
  return {
    ...actual,
    resolveDidDoc: async () => ({
      alsoKnownAs: ['at://jp.example'],
      service: [{ id: '#atproto_pds', serviceEndpoint: 'https://pds.example' }],
    }),
  };
});
vi.mock('./canonical.ts', () => ({ guardedFetchJson: async () => ({ value: validRecord }) }));

describe('toListedReview', () => {
  it('builds a ListedReview from a valid PDS record', async () => {
    const { toListedReview } = await import('./liveReview.ts');
    expect(toListedReview('did:plc:x', 'abc', validRecord)).toEqual({
      did: 'did:plc:x',
      handle: '',
      rkey: 'abc',
      subject: validRecord.subject,
      tags: validRecord.tags,
      locale: undefined,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
      stale: false,
    });
  });

  it('rejects a record with an invalid tag direction', async () => {
    const { toListedReview } = await import('./liveReview.ts');
    const record = { ...validRecord, tags: [{ adjective: 'crunchy', direction: 9 }] };
    expect(toListedReview('did:plc:x', 'abc', record)).toBeNull();
  });

  it('rejects a record with no tags', async () => {
    const { toListedReview } = await import('./liveReview.ts');
    expect(toListedReview('did:plc:x', 'abc', { ...validRecord, tags: [] })).toBeNull();
  });

  it('rejects a subject with a missing title', async () => {
    const { toListedReview } = await import('./liveReview.ts');
    const record = { ...validRecord, subject: { ...validRecord.subject, title: undefined } };
    expect(toListedReview('did:plc:x', 'abc', record)).toBeNull();
  });

  it('defaults created/updated to empty strings rather than rejecting the record', async () => {
    const { toListedReview } = await import('./liveReview.ts');
    const record: Record<string, unknown> = { ...validRecord };
    delete record.createdAt;
    delete record.updatedAt;
    expect(toListedReview('did:plc:x', 'abc', record)).toEqual(
      expect.objectContaining({ createdAt: '', updatedAt: '' }),
    );
  });
});

describe('fetchLiveReview', () => {
  it('fills the handle from the DID document, without a second network request', async () => {
    const { fetchLiveReview } = await import('./liveReview.ts');
    const review = await fetchLiveReview('did:plc:x', 'abc');
    expect(review?.handle).toBe('jp.example');
  });
});
