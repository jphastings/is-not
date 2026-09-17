import type { Agent } from '@atproto/api';
import { describe, expect, it, vi } from 'vite-plus/test';

vi.mock('./db.ts', () => ({
  findReview: (_did: string, subjectUri: string) =>
    subjectUri.includes('/reviewed')
      ? { rkey: 'x', tags: [{ direction: 0, adjective: 'fine' }] }
      : null,
}));

const { previewPopfeedImport } = await import('./popfeed.ts');

type Records = { uri: string; value: Record<string, unknown> }[];

function fakeAgent(records: Records): Agent {
  return {
    com: {
      atproto: {
        repo: {
          listRecords: async () => ({ data: { records } }),
        },
      },
    },
  } as unknown as Agent;
}

describe('previewPopfeedImport', () => {
  it('skips a review with no finite rating', async () => {
    const rows = await previewPopfeedImport(
      'did:plc:me',
      fakeAgent([
        { uri: 'at://did:plc:me/social.popfeed.feed.review/a', value: { text: 'no rating' } },
      ]),
      'en',
    );

    expect(rows).toHaveLength(0);
  });

  it('clamps and rounds an out-of-range rating to a 0-10 source, 0 included', async () => {
    const rows = await previewPopfeedImport(
      'did:plc:me',
      fakeAgent([
        { uri: 'at://did:plc:me/social.popfeed.feed.review/a', value: { rating: 14.6 } },
        { uri: 'at://did:plc:me/social.popfeed.feed.review/b', value: { rating: -2 } },
        { uri: 'at://did:plc:me/social.popfeed.feed.review/c', value: { rating: 7.4 } },
        { uri: 'at://did:plc:me/social.popfeed.feed.review/d', value: { rating: 0 } },
      ]),
      'en',
    );

    expect(rows.map((r) => r.sources)).toEqual([['10'], ['0'], ['7'], ['0']]);
  });

  it('reviews the record itself, and flags an existing review as an update', async () => {
    const rows = await previewPopfeedImport(
      'did:plc:me',
      fakeAgent([
        {
          uri: 'at://did:plc:me/social.popfeed.feed.review/reviewed',
          value: { rating: 8, createdAt: '2024-03-01T00:00:00.000Z' },
        },
      ]),
      'en',
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].subjectUri).toBe('at://did:plc:me/social.popfeed.feed.review/reviewed');
    expect(rows[0].createdAt).toBe('2024-03-01T00:00:00.000Z');
    expect(rows[0].existing).toEqual([{ direction: 0, adjective: 'fine' }]);
  });
});
