import type { Agent } from '@atproto/api';
import { describe, expect, it, vi } from 'vite-plus/test';

vi.mock('./db.ts', () => ({
  findReview: (_did: string, subjectUri: string) =>
    subjectUri.includes('app2') ? { rkey: 'x', tags: [{ direction: 0, adjective: 'fine' }] } : null,
}));

const { previewAtstoreImport } = await import('./atstore.ts');

type Records = Record<string, { uri: string; value: Record<string, unknown> }[]>;

function fakeAgent(records: Records): Agent {
  return {
    com: {
      atproto: {
        repo: {
          listRecords: async ({ collection }: { collection: string }) => ({
            data: { records: records[collection] ?? [] },
          }),
        },
      },
    },
  } as unknown as Agent;
}

describe('previewAtstoreImport', () => {
  it('groups a favourite and a review of the same app into one row with both tags', async () => {
    const rows = await previewAtstoreImport(
      'did:plc:me',
      fakeAgent({
        'fyi.atstore.listing.favorite': [
          {
            uri: 'at://did:plc:me/fyi.atstore.listing.favorite/1',
            value: { subject: 'at://did:plc:app1/fyi.atstore.listing.detail/a' },
          },
        ],
        'fyi.atstore.listing.review': [
          {
            uri: 'at://did:plc:me/fyi.atstore.listing.review/1',
            value: { subject: 'at://did:plc:app1/fyi.atstore.listing.detail/a', rating: 5 },
          },
        ],
      }),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].subjectUri).toBe('at://did:plc:app1/fyi.atstore.listing.detail/a');
    expect(rows[0].sources).toEqual(['favourite', '5']);
    expect(rows[0].existing).toBeNull();
  });

  it('imports a 3-star review as an explicit direction 0, and flags an existing review as an update', async () => {
    const rows = await previewAtstoreImport(
      'did:plc:me',
      fakeAgent({
        'fyi.atstore.listing.favorite': [],
        'fyi.atstore.listing.review': [
          {
            uri: 'at://did:plc:me/fyi.atstore.listing.review/2',
            value: { subject: 'at://did:plc:app2/fyi.atstore.listing.detail/b', rating: 3 },
          },
        ],
      }),
    );

    expect(rows[0].sources).toEqual(['3']);
    expect(rows[0].existing).toEqual([{ direction: 0, adjective: 'fine' }]);
  });

  it('paginates listRecords until the cursor runs out', async () => {
    let calls = 0;
    const agent = {
      com: {
        atproto: {
          repo: {
            listRecords: async ({
              collection,
              cursor,
            }: {
              collection: string;
              cursor?: string;
            }) => {
              if (collection !== 'fyi.atstore.listing.favorite') return { data: { records: [] } };
              calls++;
              return cursor
                ? {
                    data: {
                      records: [
                        {
                          uri: 'at://did:plc:me/fyi.atstore.listing.favorite/2',
                          value: { subject: 'at://did:plc:app1/fyi.atstore.listing.detail/a' },
                        },
                      ],
                    },
                  }
                : {
                    data: {
                      records: [
                        {
                          uri: 'at://did:plc:me/fyi.atstore.listing.favorite/1',
                          value: { subject: 'at://did:plc:app2/fyi.atstore.listing.detail/b' },
                        },
                      ],
                      cursor: 'next',
                    },
                  };
            },
          },
        },
      },
    } as unknown as Agent;

    const rows = await previewAtstoreImport('did:plc:me', agent);

    expect(calls).toBe(2);
    expect(rows.map((r) => r.subjectUri).sort()).toEqual([
      'at://did:plc:app1/fyi.atstore.listing.detail/a',
      'at://did:plc:app2/fyi.atstore.listing.detail/b',
    ]);
  });
  it('dates an imported review from its oldest source record, and shrugs at a missing rating', async () => {
    const [row] = await previewAtstoreImport(
      'did:plc:me',
      fakeAgent({
        'fyi.atstore.listing.favorite': [
          {
            uri: 'at://did:plc:me/fyi.atstore.listing.favorite/1',
            value: {
              subject: 'at://did:plc:app1/fyi.atstore.listing.detail/a',
              createdAt: '2024-03-01T00:00:00.000Z',
            },
          },
        ],
        'fyi.atstore.listing.review': [
          {
            uri: 'at://did:plc:me/fyi.atstore.listing.review/1',
            value: {
              subject: 'at://did:plc:app1/fyi.atstore.listing.detail/a',
              createdAt: '2023-01-05T00:00:00.000Z',
            },
          },
        ],
      }),
    );

    expect(row.createdAt).toBe('2023-01-05T00:00:00.000Z');
    expect(row.sources).toContain('3');
  });
});
