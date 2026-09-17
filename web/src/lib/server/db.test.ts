import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { beforeAll, describe, expect, it, vi } from 'vite-plus/test';

vi.mock('$env/dynamic/private', () => ({ env: process.env }));

process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), 'isnot-db-')), 'test.db');

const when = '2026-09-15T12:00:00.000Z';

beforeAll(() => {
  const setup = new DatabaseSync(process.env.DATABASE_PATH!);
  // The writer's own schema, so this test fails if the site reads columns the ingester stopped writing.
  const migrations = join(import.meta.dirname, '../../../../migrations');
  for (const file of readdirSync(migrations).sort()) {
    setup.exec(readFileSync(join(migrations, file), 'utf8'));
  }
  setup
    .prepare('INSERT INTO accounts (did, handle, updated_at) VALUES (?, ?, ?)')
    .run('did:plc:known', 'known.example', when);
  const review = setup.prepare(
    `INSERT INTO reviews (did, rkey, subject_uri, subject_cid, subject_title, subject_type, locale, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  review.run(
    'did:plc:known',
    'two-tags',
    'at://did:plc:x/app.bsky.feed.post/1',
    'bafy1',
    'a sandwich',
    'post',
    'en',
    when,
    when,
  );
  review.run(
    'did:plc:known',
    'neutral-only',
    'at://did:plc:x/app.bsky.feed.post/2',
    'bafy2',
    'a rock',
    'post',
    '',
    when,
    when,
  );
  review.run(
    'did:plc:unknown',
    'one-tag',
    'at://did:plc:x/app.bsky.feed.post/3',
    'bafy3',
    'a chair',
    'post',
    '',
    when,
    when,
  );
  review.run(
    'did:plc:unknown',
    'same-subject',
    'at://did:plc:x/app.bsky.feed.post/1',
    'bafy1',
    'a sandwich',
    'post',
    '',
    when,
    when,
  );
  const tag = setup.prepare(
    'INSERT INTO review_tags (did, rkey, adjective, direction) VALUES (?, ?, ?, ?)',
  );
  tag.run('did:plc:known', 'two-tags', 'delicious', 1);
  tag.run('did:plc:known', 'two-tags', 'filling', 2);
  tag.run('did:plc:known', 'neutral-only', 'unremarkable', 0);
  tag.run('did:plc:unknown', 'one-tag', 'boring', -1);
  tag.run('did:plc:unknown', 'same-subject', 'delicious', 1);
  setup.close();
});

describe('randomSentences', () => {
  it('returns one tag per sentence, skipping direction 0, with the handle when known', async () => {
    const { randomSentences } = await import('./db');
    const sentences = randomSentences();

    expect(sentences).toHaveLength(4);
    expect(sentences.every((s) => s.tags.length === 1)).toBe(true);
    expect(sentences.map((s) => s.tags[0].adjective).sort()).toEqual([
      'boring',
      'delicious',
      'delicious',
      'filling',
    ]);

    const known = sentences.find(
      (s) => s.handle === 'known.example' && s.tags[0].adjective === 'delicious',
    );
    expect(known?.handle).toBe('known.example');
    expect(known?.locale).toBe('en');
    expect(known?.subject).toEqual({
      uri: 'at://did:plc:x/app.bsky.feed.post/1',
      cid: 'bafy1',
      title: 'a sandwich',
      type: 'post',
    });

    const unknown = sentences.find((s) => s.tags[0].adjective === 'boring');
    expect(unknown?.handle).toBe('');
    expect(unknown?.locale).toBeUndefined();
  });

  it('respects the limit', async () => {
    const { randomSentences } = await import('./db');
    expect(randomSentences(1)).toHaveLength(1);
  });
});

describe('findReview', () => {
  it('returns the stored review with its tags', async () => {
    const { findReview } = await import('./db');
    expect(findReview('did:plc:known', 'at://did:plc:x/app.bsky.feed.post/1')).toEqual({
      rkey: 'two-tags',
      createdAt: when,
      tags: [
        { adjective: 'delicious', direction: 1 },
        { adjective: 'filling', direction: 2 },
      ],
      locale: 'en',
    });
  });

  it('returns null for an unknown subject', async () => {
    const { findReview } = await import('./db');
    expect(
      findReview('did:plc:known', 'at://did:plc:x/app.bsky.feed.post/does-not-exist'),
    ).toBeNull();
  });
});

describe('listReviews', () => {
  it('returns every review for the account with its tags, direction 0 included', async () => {
    const { listReviews } = await import('./db');
    const reviews = listReviews({ did: 'did:plc:known' });

    expect(reviews.map((r) => r.subject.title).sort()).toEqual(['a rock', 'a sandwich']);
    const sandwich = reviews.find((r) => r.subject.title === 'a sandwich');
    expect(sandwich?.tags.sort((a, b) => a.adjective.localeCompare(b.adjective))).toEqual([
      { adjective: 'delicious', direction: 1 },
      { adjective: 'filling', direction: 2 },
    ]);
    const rock = reviews.find((r) => r.subject.title === 'a rock');
    expect(rock?.tags).toEqual([{ adjective: 'unremarkable', direction: 0 }]);
  });

  it('filters by adjective, keeping every tag on the matching review', async () => {
    const { listReviews } = await import('./db');
    const reviews = listReviews({ did: 'did:plc:known' }, { adjective: 'delicious' });
    expect(reviews).toHaveLength(1);
    expect(reviews[0].tags.map((t) => t.adjective).sort()).toEqual(['delicious', 'filling']);
  });

  it("lists every account's reviews of one subject, with the reviewer", async () => {
    const { listReviews } = await import('./db');
    const reviews = listReviews({ subjectUri: 'at://did:plc:x/app.bsky.feed.post/1' });
    expect(reviews.map((r) => r.did).sort()).toEqual(['did:plc:known', 'did:plc:unknown']);
    expect(reviews.find((r) => r.did === 'did:plc:known')?.handle).toBe('known.example');
  });

  it('filters by subject type', async () => {
    const { listReviews } = await import('./db');
    expect(listReviews({ did: 'did:plc:known' }, { type: 'does-not-exist' })).toEqual([]);
    expect(listReviews({ did: 'did:plc:known' }, { type: 'post' })).toHaveLength(2);
  });
});

describe('subjectTypesFor', () => {
  it('returns the distinct subject types for the account', async () => {
    const { subjectTypesFor } = await import('./db');
    expect(subjectTypesFor({ did: 'did:plc:known' })).toEqual(['post']);
    expect(subjectTypesFor({ did: 'did:plc:nobody' })).toEqual([]);
  });
});

describe('adjectiveCounts', () => {
  it('counts each adjective the account has used, most-used first', async () => {
    const { adjectiveCounts } = await import('./db');
    expect(adjectiveCounts({ did: 'did:plc:known' })).toEqual([
      { adjective: 'delicious', count: 1 },
      { adjective: 'filling', count: 1 },
      { adjective: 'unremarkable', count: 1 },
    ]);
  });

  it('counts the adjectives used about one subject', async () => {
    const { adjectiveCounts } = await import('./db');
    expect(adjectiveCounts({ subjectUri: 'at://did:plc:x/app.bsky.feed.post/1' })).toEqual([
      { adjective: 'delicious', count: 2 },
      { adjective: 'filling', count: 1 },
    ]);
  });
});
