import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { beforeAll, describe, expect, it, vi } from 'vite-plus/test';

vi.mock('$env/dynamic/private', () => ({ env: process.env }));

process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), 'isnot-db-pagination-')), 'test.db');

const NEWER = '2026-02-02T00:00:00.000Z';
const OLDER = '2026-01-01T00:00:00.000Z';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

beforeAll(() => {
  const setup = new DatabaseSync(process.env.DATABASE_PATH!);
  const migrations = join(import.meta.dirname, '../../../../migrations');
  for (const file of readdirSync(migrations).sort()) {
    setup.exec(readFileSync(join(migrations, file), 'utf8'));
  }
  const review = setup.prepare(
    `INSERT INTO reviews (did, rkey, subject_uri, subject_cid, subject_title, subject_type, locale, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, '', ?, ?)`,
  );
  const tag = setup.prepare(
    'INSERT INTO review_tags (did, rkey, adjective, direction) VALUES (?, ?, ?, ?)',
  );

  // 60 reviews across two equal `updated_at` buckets of 30 each, so a page
  // boundary drawn anywhere in the newer bucket (with the full-scope page
  // size) lands inside the older bucket's tie group.
  for (let i = 1; i <= 30; i++) {
    review.run(
      `did:plc:a${pad(i)}`,
      'x',
      `at://did:plc:x/app.bsky.feed.post/a${i}`,
      'bafy',
      'thing',
      'chain-fixture',
      NEWER,
      NEWER,
    );
    tag.run(`did:plc:a${pad(i)}`, 'x', 'fine', 1);
  }
  for (let i = 1; i <= 30; i++) {
    review.run(
      `did:plc:b${pad(i)}`,
      'x',
      `at://did:plc:x/app.bsky.feed.post/b${i}`,
      'bafy',
      'thing',
      'chain-fixture',
      OLDER,
      OLDER,
    );
    tag.run(`did:plc:b${pad(i)}`, 'x', 'fine', 1);
  }

  // One account, mostly type "post", with two "book" reviews at opposite
  // ends of its own update order — proves a type filter narrows the whole
  // scope, not just whichever rows a naive LIMIT would have kept.
  for (let i = 1; i <= 55; i++) {
    review.run(
      'did:plc:filter',
      `post-${pad(i)}`,
      `at://did:plc:x/app.bsky.feed.post/p${i}`,
      'bafy',
      'a post',
      'post',
      OLDER,
      `2026-01-${pad((i % 27) + 1)}T00:00:00.000Z`,
    );
    tag.run('did:plc:filter', `post-${pad(i)}`, 'fine', 1);
  }
  review.run(
    'did:plc:filter',
    'book-new',
    'at://did:plc:x/app.bsky.feed.book/1',
    'bafy',
    'a book',
    'book',
    OLDER,
    '2026-02-01T00:00:00.000Z',
  );
  tag.run('did:plc:filter', 'book-new', 'fine', 1);
  review.run(
    'did:plc:filter',
    'book-old',
    'at://did:plc:x/app.bsky.feed.book/2',
    'bafy',
    'another book',
    'book',
    OLDER,
    '2025-01-01T00:00:00.000Z',
  );
  tag.run('did:plc:filter', 'book-old', 'fine', 1);

  // A review whose only "good" tag points the other way from its only
  // direction=1 tag, so adjective=good&direction=1 must not match it.
  review.run(
    'did:plc:sametag',
    'r1',
    'at://did:plc:x/app.bsky.feed.post/s1',
    'bafy',
    'a sandwich',
    'post',
    OLDER,
    OLDER,
  );
  tag.run('did:plc:sametag', 'r1', 'good', -1);
  tag.run('did:plc:sametag', 'r1', 'quick', 1);

  // 25 adjectives used twice, 5 used once, to check the cloud keeps the top
  // 25 and breaks ties on the tied adjectives alphabetically.
  for (let i = 0; i < 25; i++) {
    for (let n = 0; n < 2; n++) {
      const rkey = `top-${pad(i)}-${n}`;
      review.run(
        'did:plc:cloud',
        rkey,
        `at://did:plc:x/app.bsky.feed.post/t${i}${n}`,
        'bafy',
        'x',
        'post',
        OLDER,
        OLDER,
      );
      tag.run('did:plc:cloud', rkey, `top${pad(i)}`, 1);
    }
  }
  for (let i = 0; i < 5; i++) {
    const rkey = `bot-${pad(i)}`;
    review.run(
      'did:plc:cloud',
      rkey,
      `at://did:plc:x/app.bsky.feed.post/o${i}`,
      'bafy',
      'x',
      'post',
      OLDER,
      OLDER,
    );
    tag.run('did:plc:cloud', rkey, `bot${pad(i)}`, 1);
  }

  // The lens resolved book-new's subject to a newer record than the review names,
  // so that review reads as stale and takes the lens's title and identifiers.
  setup
    .prepare('INSERT INTO subjects (uri, cid, title, type, resolved_at) VALUES (?, ?, ?, ?, ?)')
    .run(
      'at://did:plc:x/app.bsky.feed.book/1',
      'bafy-newer',
      'A Book, As The Lens Reads It',
      'book',
      NEWER,
    );
  setup
    .prepare('INSERT INTO subject_identifiers (uri, key, value) VALUES (?, ?, ?)')
    .run('at://did:plc:x/app.bsky.feed.book/1', 'isbn13', '9780000000001');

  setup.close();
});

describe('listReviewsPage', () => {
  it('chains across equal updated_at values without gaps or overlaps', async () => {
    const { listReviewsPage, decodeCursor, REVIEWS_PAGE_SIZE } = await import('./db');

    const page1 = listReviewsPage({ all: true }, { type: 'chain-fixture' });
    expect(page1.reviews).toHaveLength(REVIEWS_PAGE_SIZE);
    expect(page1.nextCursor).not.toBeNull();

    const cursor = decodeCursor(page1.nextCursor);
    const page2 = listReviewsPage({ all: true }, { type: 'chain-fixture' }, cursor);
    expect(page2.nextCursor).toBeNull();

    const combined = [...page1.reviews, ...page2.reviews].map((r) => r.did);
    const expected = [
      ...Array.from({ length: 30 }, (_, i) => `did:plc:a${pad(i + 1)}`),
      ...Array.from({ length: 30 }, (_, i) => `did:plc:b${pad(i + 1)}`),
    ];
    expect(combined.sort()).toEqual(expected.sort());
  });

  it('applies a filter to the whole scope, not just the loaded page', async () => {
    const { listReviewsPage } = await import('./db');
    const { reviews, nextCursor } = listReviewsPage({ did: 'did:plc:filter' }, { type: 'book' });

    expect(reviews.map((r) => r.rkey).sort()).toEqual(['book-new', 'book-old']);
    expect(nextCursor).toBeNull();

    const lensed = reviews.find((r) => r.rkey === 'book-new')!;
    expect(lensed.subject.title).toBe('A Book, As The Lens Reads It');
    expect(lensed.subject.identifiers).toEqual([{ key: 'isbn13', value: '9780000000001' }]);
    expect(lensed.stale).toBe(true);

    const unresolved = reviews.find((r) => r.rkey === 'book-old')!;
    expect(unresolved.subject.title).toBe('another book');
    expect(unresolved.subject.identifiers).toBeUndefined();
    expect(unresolved.stale).toBe(false);
  });

  it('requires adjective and direction to match the same tag', async () => {
    const { listReviewsPage } = await import('./db');

    const wrongPairing = listReviewsPage(
      { did: 'did:plc:sametag' },
      { adjective: 'good', directions: [1] },
    );
    expect(wrongPairing.reviews).toEqual([]);

    const correctPairing = listReviewsPage(
      { did: 'did:plc:sametag' },
      { adjective: 'good', directions: [-1] },
    );
    expect(correctPairing.reviews).toHaveLength(1);
  });
});

describe('adjectiveCounts', () => {
  it('keeps only the top 25, ties broken alphabetically', async () => {
    const { adjectiveCounts } = await import('./db');
    const counts = adjectiveCounts({ did: 'did:plc:cloud' });

    expect(counts).toHaveLength(25);
    expect(counts.every((c) => c.count === 2)).toBe(true);
    expect(counts.map((c) => c.adjective)).toEqual(
      Array.from({ length: 25 }, (_, i) => `top${pad(i)}`),
    );
  });
});
