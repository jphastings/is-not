import { mkdtempSync, readFileSync } from 'node:fs';
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
  setup.exec(
    readFileSync(join(import.meta.dirname, '../../../../migrations/001_init.sql'), 'utf8'),
  );
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
  const tag = setup.prepare(
    'INSERT INTO review_tags (did, rkey, adjective, direction) VALUES (?, ?, ?, ?)',
  );
  tag.run('did:plc:known', 'two-tags', 'delicious', 1);
  tag.run('did:plc:known', 'two-tags', 'filling', 2);
  tag.run('did:plc:known', 'neutral-only', 'unremarkable', 0);
  tag.run('did:plc:unknown', 'one-tag', 'boring', -1);
  setup.close();
});

describe('randomSentences', () => {
  it('returns one tag per sentence, skipping direction 0, with the handle when known', async () => {
    const { randomSentences } = await import('./db');
    const sentences = randomSentences();

    expect(sentences).toHaveLength(3);
    expect(sentences.every((s) => s.tags.length === 1)).toBe(true);
    expect(sentences.map((s) => s.tags[0].adjective).sort()).toEqual([
      'boring',
      'delicious',
      'filling',
    ]);

    const known = sentences.find((s) => s.tags[0].adjective === 'delicious');
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
