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
		CREATE TABLE tags (
			did TEXT, rkey TEXT, subject_uri TEXT, subject_cid TEXT,
			subject_title TEXT, subject_type TEXT, adjective TEXT,
			direction INTEGER, updated_at TEXT
		);
		CREATE TABLE accounts (did TEXT PRIMARY KEY, handle TEXT DEFAULT '', updated_at TEXT);
	`);
	setup
		.prepare(
			'INSERT INTO accounts (did, handle) VALUES (?, ?)'
		)
		.run('did:plc:known', 'known.bsky.social');
	const insertTag = setup.prepare(
		'INSERT INTO tags (did, subject_title, adjective, direction) VALUES (?, ?, ?, ?)'
	);
	insertTag.run('did:plc:known', 'a sandwich', 'delicious', 1);
	insertTag.run('did:plc:unknown', 'a rock', 'boring', -1);
	insertTag.run('did:plc:known', 'silence', 'neutral', 0);
	setup.close();
});

describe('randomTags', () => {
	it('excludes direction-0 tags and fills in an empty handle for unknown dids', async () => {
		const { randomTags } = await import('./db');
		const tags = randomTags();

		expect(tags).toHaveLength(2);
		expect(tags.find((t) => t.title === 'silence')).toBeUndefined();
		expect(tags.find((t) => t.did === 'did:plc:unknown')?.handle).toBe('');
		expect(tags.find((t) => t.did === 'did:plc:known')?.handle).toBe('known.bsky.social');
	});
});
