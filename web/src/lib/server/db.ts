import { DatabaseSync } from 'node:sqlite';
import { env } from '$env/dynamic/private';
import type { Direction, Tag } from '@is-not/sentence';

export type HomeReview = {
  did: string;
  handle: string;
  rkey: string;
  subject: { uri: string; cid: string; title: string; type: string };
  tags: { direction: Direction; adjective: string }[];
  locale?: string;
  createdAt: string;
  updatedAt: string;
};

const QUERY = `
  SELECT r.did, r.rkey, COALESCE(a.handle, '') AS handle,
         r.subject_uri, r.subject_cid, r.subject_title, r.subject_type,
         r.locale, r.created_at, r.updated_at,
         t.adjective, t.direction
  FROM review_tags t
  JOIN reviews r ON r.did = t.did AND r.rkey = t.rkey
  LEFT JOIN accounts a ON a.did = r.did
  WHERE t.direction != 0
  ORDER BY random()
  LIMIT ?
`;

type Row = {
  did: string;
  rkey: string;
  handle: string;
  subject_uri: string;
  subject_cid: string;
  subject_title: string;
  subject_type: string;
  locale: string;
  created_at: string;
  updated_at: string;
  adjective: string;
  direction: Direction;
};

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

/** Random reviews, each carrying exactly one tag, for the rotating homepage sentence. */
export function randomSentences(limit = 10): HomeReview[] {
  const conn = open();
  if (!conn) return [];
  const rows = conn.prepare(QUERY).all(limit) as unknown as Row[];
  return rows.map((row) => ({
    did: row.did,
    handle: row.handle,
    rkey: row.rkey,
    subject: {
      uri: row.subject_uri,
      cid: row.subject_cid,
      title: row.subject_title,
      type: row.subject_type,
    },
    tags: [{ direction: row.direction, adjective: row.adjective }],
    locale: row.locale || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export type ExistingReview = { rkey: string; createdAt: string; tags: Tag[]; locale?: string };

/** The reviewer's own review of a subject, if they have already reviewed it. */
export function findReview(did: string, subjectUri: string): ExistingReview | null {
  const conn = open();
  if (!conn) return null;
  const review = conn
    .prepare(
      `SELECT rkey, locale, created_at FROM reviews
       WHERE did = ? AND subject_uri = ?
       ORDER BY updated_at DESC LIMIT 1`,
    )
    .get(did, subjectUri) as { rkey: string; locale: string; created_at: string } | undefined;
  if (!review) return null;
  const tags = conn
    .prepare(
      'SELECT adjective, direction FROM review_tags WHERE did = ? AND rkey = ? ORDER BY adjective',
    )
    .all(did, review.rkey) as unknown as Tag[];
  return {
    rkey: review.rkey,
    createdAt: review.created_at,
    tags,
    locale: review.locale || undefined,
  };
}
