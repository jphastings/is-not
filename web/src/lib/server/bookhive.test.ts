import type { Agent } from '@atproto/api';
import { describe, expect, it, vi } from 'vite-plus/test';

vi.mock('./db.ts', () => ({
  findReview: (_did: string, subjectUri: string) =>
    subjectUri.includes('/reviewed')
      ? { rkey: 'x', tags: [{ direction: 0, adjective: 'fine' }] }
      : null,
}));

const { previewBookhiveImport } = await import('./bookhive.ts');

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

describe('previewBookhiveImport', () => {
  it('skips a want-to-read book with no stars', async () => {
    const rows = await previewBookhiveImport(
      'did:plc:me',
      fakeAgent([
        {
          uri: 'at://did:plc:me/buzz.bookhive.book/a',
          value: { title: 'Unread', status: 'buzz.bookhive.defs#wantToRead' },
        },
      ]),
    );

    expect(rows).toHaveLength(0);
  });

  it('clamps and rounds an out-of-range stars value to a 1-10 source', async () => {
    const rows = await previewBookhiveImport(
      'did:plc:me',
      fakeAgent([
        { uri: 'at://did:plc:me/buzz.bookhive.book/a', value: { title: 'Too many', stars: 14.6 } },
        { uri: 'at://did:plc:me/buzz.bookhive.book/b', value: { title: 'Too few', stars: -2 } },
        {
          uri: 'at://did:plc:me/buzz.bookhive.book/c',
          value: { title: 'Rounds down', stars: 7.4 },
        },
      ]),
    );

    expect(rows.map((r) => r.sources)).toEqual([['10'], ['1'], ['7']]);
  });

  it('reviews the book record itself, and flags an existing review as an update', async () => {
    const rows = await previewBookhiveImport(
      'did:plc:me',
      fakeAgent([
        {
          uri: 'at://did:plc:me/buzz.bookhive.book/reviewed',
          value: { title: 'Read before', stars: 8, createdAt: '2024-03-01T00:00:00.000Z' },
        },
      ]),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].subjectUri).toBe('at://did:plc:me/buzz.bookhive.book/reviewed');
    expect(rows[0].createdAt).toBe('2024-03-01T00:00:00.000Z');
    expect(rows[0].existing).toEqual([{ direction: 0, adjective: 'fine' }]);
  });
});
