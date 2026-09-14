import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vite-plus/test';

vi.mock('$env/dynamic/private', () => ({ env: process.env }));

process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), 'isnot-db-')), 'test.db');

beforeAll(() => {
	const setup = new DatabaseSync(process.env.DATABASE_PATH!);
	setup.exec(`
		CREATE TABLE reviews (
			did TEXT, rkey TEXT, subject_uri TEXT, subject_cid TEXT,
			subject_title TEXT, subject_type TEXT, created_at TEXT, updated_at TEXT
		);
		CREATE TABLE review_tags (
			did TEXT, rkey TEXT, adjective TEXT, direction INTEGER,
			PRIMARY KEY (did, rkey, adjective)
		);
		CREATE TABLE accounts (did TEXT PRIMARY KEY, handle TEXT DEFAULT '', updated_at TEXT);
	`);
	setup
		.prepare(
			'INSERT INTO accounts (did, handle) VALUES (?, ?)'
		)
		.run('did:plc:known', 'known.bsky.social');
	const insertReview = setup.prepare(
		'INSERT INTO reviews (did, rkey, subject_title) VALUES (?, ?, ?)'
	);
	insertReview.run('did:plc:known', 'rkey1', 'a sandwich');
	insertReview.run('did:plc:unknown', 'rkey2', 'a rock');
	const insertTag = setup.prepare(
		'INSERT INTO review_tags (did, rkey, adjective, direction) VALUES (?, ?, ?, ?)'
	);
	insertTag.run('did:plc:known', 'rkey1', 'delicious', 1);
	insertTag.run('did:plc:known', 'rkey1', 'neutral', 0);
	insertTag.run('did:plc:unknown', 'rkey2', 'boring', -1);
	setup.close();
});

describe('randomTags', () => {
	it('excludes direction-0 tags and fills in an empty handle for unknown dids', async () => {
		const { randomTags } = await import('./db');
		const tags = randomTags();

		expect(tags).toHaveLength(2);
		expect(tags.find((t) => t.adjective === 'neutral')).toBeUndefined();
		expect(tags.find((t) => t.did === 'did:plc:unknown')?.handle).toBe('');
		expect(tags.find((t) => t.did === 'did:plc:known')?.handle).toBe('known.bsky.social');
	});
});
