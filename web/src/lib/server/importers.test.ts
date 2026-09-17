import type { Agent } from '@atproto/api';
import { describe, expect, it, vi } from 'vite-plus/test';

vi.mock('./db.ts', () => ({
  findReview: (_did: string, subjectUri: string) =>
    subjectUri.includes('/reviewed')
      ? { rkey: 'x', tags: [{ direction: 0, adjective: 'fine' }] }
      : null,
}));

const { previewPresenceImport } = await import('./importers.ts');

function fakeAgent(records: { uri: string; value: Record<string, unknown> }[]): Agent {
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

const subjectOf = (v: Record<string, unknown>) =>
  typeof v.subject === 'string' ? v.subject : undefined;

describe('previewPresenceImport', () => {
  it('skips a record with no string subject', async () => {
    const rows = await previewPresenceImport(
      'did:plc:me',
      fakeAgent([{ uri: 'at://did:plc:me/x.like/a', value: {} }]),
      'en',
      'x.like',
      'like',
      subjectOf,
    );

    expect(rows).toHaveLength(0);
  });

  it('dedupes repeated likes of the same subject, keeping the earliest createdAt', async () => {
    const rows = await previewPresenceImport(
      'did:plc:me',
      fakeAgent([
        {
          uri: 'at://did:plc:me/x.like/a',
          value: { subject: 'at://did:plc:app/y/1', createdAt: '2024-03-01T00:00:00.000Z' },
        },
        {
          uri: 'at://did:plc:me/x.like/b',
          value: { subject: 'at://did:plc:app/y/1', createdAt: '2023-01-05T00:00:00.000Z' },
        },
      ]),
      'en',
      'x.like',
      'like',
      subjectOf,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].sources).toEqual(['like']);
    expect(rows[0].createdAt).toBe('2023-01-05T00:00:00.000Z');
  });

  it('flags an existing review as an update', async () => {
    const rows = await previewPresenceImport(
      'did:plc:me',
      fakeAgent([
        { uri: 'at://did:plc:me/x.like/a', value: { subject: 'at://did:plc:app/reviewed/1' } },
      ]),
      'en',
      'x.like',
      'like',
      subjectOf,
    );

    expect(rows[0].existing).toEqual([{ direction: 0, adjective: 'fine' }]);
  });
});
