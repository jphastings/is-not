import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { beforeAll, describe, expect, it, vi } from 'vite-plus/test';

vi.mock('$env/dynamic/private', () => ({ env: process.env }));

process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), 'isnot-reviews-')), 'test.db');

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

// Not yet ingested: neither DID has a `reviews` row, so `singleReview` always
// takes the live-PDS fallback and its DID-doc handle ('doc.example') would
// show through unless the account's own handle wins.
beforeAll(() => {
  const setup = new DatabaseSync(process.env.DATABASE_PATH!);
  const migrations = join(import.meta.dirname, '../../../../migrations');
  for (const file of readdirSync(migrations).sort()) {
    setup.exec(readFileSync(join(migrations, file), 'utf8'));
  }
  setup
    .prepare('INSERT INTO accounts (did, handle, updated_at) VALUES (?, ?, ?)')
    .run('did:plc:known', 'known.example', '2026-01-01T00:00:00.000Z');
  setup.close();
});

vi.mock('./accounts.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./accounts.ts')>();
  return {
    ...actual,
    resolveDidDoc: async () => ({
      alsoKnownAs: ['at://doc.example'],
      service: [{ id: '#atproto_pds', serviceEndpoint: 'https://pds.example' }],
    }),
  };
});
vi.mock('./canonical.ts', () => ({ guardedFetchJson: async () => ({ value: validRecord }) }));

describe('singleReview', () => {
  it("prefers the accounts table's handle over the DID doc's for a known account", async () => {
    const { singleReview } = await import('./reviews.ts');
    const review = await singleReview('did:plc:known', 'abc');
    expect(review?.handle).toBe('known.example');
  });

  it('falls back to the DID doc for a DID the ingester has never seen', async () => {
    const { singleReview } = await import('./reviews.ts');
    const review = await singleReview('did:plc:unknown', 'abc');
    expect(review?.handle).toBe('doc.example');
  });
});
