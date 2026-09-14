import { DatabaseSync } from 'node:sqlite';
import { env } from '$env/dynamic/private';
import type { Tag } from '$lib/tags';

export type { Tag } from '$lib/tags';
export { directionPhrase } from '$lib/tags';

const QUERY = `
	SELECT t.did, COALESCE(a.handle, '') AS handle, t.subject_title AS title, t.direction, t.adjective
	FROM tags t
	LEFT JOIN accounts a ON a.did = t.did
	WHERE t.direction != 0
	ORDER BY random()
	LIMIT ?
`;

let db: DatabaseSync | undefined;

function open(): DatabaseSync | undefined {
	if (db) return db;
	try {
		db = new DatabaseSync(env.DATABASE_PATH ?? '../isnot.db', { readOnly: true });
	} catch {
		return undefined;
	}
	return db;
}

export function randomTags(limit = 10): Tag[] {
	const conn = open();
	if (!conn) return [];
	return conn.prepare(QUERY).all(limit) as unknown as Tag[];
}
