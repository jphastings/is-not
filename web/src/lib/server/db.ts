import { DatabaseSync } from 'node:sqlite';
import { env } from '$env/dynamic/private';
import type { Subject } from '@is-not/lenses';
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

/** The subject as the lens saw it, falling back to what the poster wrote. `r` is
    the reviews alias; the caller joins `subjects s`. */
const SUBJECT_COLUMNS = `
  r.subject_uri, r.subject_cid,
  COALESCE(s.title, r.subject_title) AS subject_title,
  COALESCE(s.type, r.subject_type) AS subject_type,
  s.cid AS resolved_cid,
  (SELECT json_group_array(json_object('key', i.key, 'value', i.value))
     FROM (SELECT key, value FROM subject_identifiers WHERE uri = r.subject_uri ORDER BY key, value) i) AS identifiers`;
const SUBJECT_JOIN = 'LEFT JOIN subjects s ON s.uri = r.subject_uri';
const TYPE_FILTER = 'COALESCE(s.type, r.subject_type) = ?';

type SubjectRow = {
  subject_uri: string;
  subject_cid: string;
  subject_title: string;
  subject_type: string;
  resolved_cid: string | null;
  identifiers: string;
};

function rowSubject(row: SubjectRow): { subject: Subject; stale: boolean } {
  const identifiers = JSON.parse(row.identifiers) as Subject['identifiers'];
  return {
    subject: {
      uri: row.subject_uri,
      cid: row.subject_cid,
      title: row.subject_title,
      type: row.subject_type,
      ...(identifiers?.length ? { identifiers } : {}),
    },
    stale: row.resolved_cid !== null && row.resolved_cid !== row.subject_cid,
  };
}

const QUERY = `
  SELECT r.did, r.rkey, COALESCE(a.handle, '') AS handle,
         r.subject_uri, r.subject_cid,
         COALESCE(s.title, r.subject_title) AS subject_title,
         COALESCE(s.type, r.subject_type) AS subject_type,
         r.locale, r.created_at, r.updated_at,
         t.adjective, t.direction
  FROM review_tags t
  JOIN reviews r ON r.did = t.did AND r.rkey = t.rkey
  ${SUBJECT_JOIN}
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
    // The ingester is writing to this file; wait for it rather than throwing.
    db.exec('PRAGMA busy_timeout = 5000');
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

export type ListedReview = {
  did: string;
  handle: string;
  rkey: string;
  subject: Subject;
  tags: Tag[];
  locale?: string;
  createdAt: string;
  updatedAt: string;
  /** The review named an older version of the subject than the one lensed. */
  stale: boolean;
};

export type ReviewFilters = { type?: string; adjective?: string; directions?: Direction[] };

/** Reviews are listed by who wrote them, what they are about, or (`all`) the whole database. */
export type ReviewScope = { did: string } | { subjectUri: string } | { all: true };

const scopeClause = (scope: ReviewScope): { sql: string; params: string[] } =>
  'did' in scope
    ? { sql: 'r.did = ?', params: [scope.did] }
    : 'subjectUri' in scope
      ? { sql: 'r.subject_uri = ?', params: [scope.subjectUri] }
      : { sql: '1=1', params: [] };

/** A review matches an adjective/direction filter only when the *same* tag
    carries both — a review that "is not good" shouldn't match adjective=good
    plus direction=+1 just because it also has some unrelated +1 tag. */
function tagMatchClause(filters: ReviewFilters, params: (string | number)[]): string | null {
  if (!filters.adjective && !filters.directions?.length) return null;
  const conditions = ['x.did = r.did', 'x.rkey = r.rkey'];
  if (filters.adjective) {
    conditions.push('x.adjective = ?');
    params.push(filters.adjective);
  }
  if (filters.directions?.length) {
    conditions.push(`x.direction IN (${filters.directions.map(() => '?').join(',')})`);
    params.push(...filters.directions);
  }
  return `EXISTS (SELECT 1 FROM review_tags x WHERE ${conditions.join(' AND ')})`;
}

type ListRow = SubjectRow & {
  did: string;
  handle: string;
  rkey: string;
  locale: string;
  created_at: string;
  updated_at: string;
  adjective: string;
  direction: Direction;
};

/** Every review in scope, newest update first, optionally narrowed to one subject type and/or adjective. */
export function listReviews(scope: ReviewScope, filters: ReviewFilters = {}): ListedReview[] {
  const conn = open();
  if (!conn) return [];

  const scoped = scopeClause(scope);
  const conditions = [scoped.sql];
  const params: (string | number)[] = [...scoped.params];
  if (filters.type) {
    conditions.push(TYPE_FILTER);
    params.push(filters.type);
  }
  const tagClause = tagMatchClause(filters, params);
  if (tagClause) conditions.push(tagClause);

  const rows = conn
    .prepare(
      `SELECT r.did, COALESCE(a.handle, '') AS handle, r.rkey, ${SUBJECT_COLUMNS},
              r.locale, r.created_at, r.updated_at, t.adjective, t.direction
       FROM reviews r
       ${SUBJECT_JOIN}
       JOIN review_tags t ON t.did = r.did AND t.rkey = r.rkey
       LEFT JOIN accounts a ON a.did = r.did
       WHERE ${conditions.join(' AND ')}
       ORDER BY r.updated_at DESC, r.did, r.rkey, t.adjective`,
    )
    .all(...params) as unknown as ListRow[];

  const byRecord = new Map<string, ListedReview>();
  for (const row of rows) {
    const key = `${row.did}/${row.rkey}`;
    let review = byRecord.get(key);
    if (!review) {
      review = {
        did: row.did,
        handle: row.handle,
        rkey: row.rkey,
        ...rowSubject(row),
        tags: [],
        locale: row.locale || undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
      byRecord.set(key, review);
    }
    review.tags.push({ adjective: row.adjective, direction: row.direction });
  }
  return [...byRecord.values()];
}

export const REVIEWS_PAGE_SIZE = 50;

export type Cursor = { updatedAt: string; did: string; rkey: string };

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

/** Malformed or tampered cursors fall back to the first page rather than erroring. */
export function decodeCursor(raw: string | null): Cursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (
      parsed &&
      typeof parsed.updatedAt === 'string' &&
      typeof parsed.did === 'string' &&
      typeof parsed.rkey === 'string'
    ) {
      return parsed as Cursor;
    }
  } catch {
    // fall through to null
  }
  return null;
}

export type ReviewsPage = { reviews: ListedReview[]; nextCursor: string | null };

/**
 * One page of reviews in scope, newest update first, filtered (whole scope,
 * not just the page) by type/adjective/direction. Keyset pagination on
 * `(updated_at, did, rkey)` descending — never OFFSET — so paging stays
 * correct as new reviews are ingested between requests. The record page is
 * selected first (the subquery), then joined out to its tags, so a review
 * with many tags never costs it more than one row of the page.
 */
export function listReviewsPage(
  scope: ReviewScope,
  filters: ReviewFilters = {},
  cursor: Cursor | null = null,
): ReviewsPage {
  const conn = open();
  if (!conn) return { reviews: [], nextCursor: null };

  const scoped = scopeClause(scope);
  const conditions = [scoped.sql];
  const params: (string | number)[] = [...scoped.params];
  if (filters.type) {
    conditions.push(TYPE_FILTER);
    params.push(filters.type);
  }
  const tagClause = tagMatchClause(filters, params);
  if (tagClause) conditions.push(tagClause);
  if (cursor) {
    conditions.push('(r.updated_at, r.did, r.rkey) < (?, ?, ?)');
    params.push(cursor.updatedAt, cursor.did, cursor.rkey);
  }

  const rows = conn
    .prepare(
      `SELECT r.did, r.rkey, COALESCE(a.handle, '') AS handle, ${SUBJECT_COLUMNS},
              r.locale, r.created_at, r.updated_at, t.adjective, t.direction
       FROM (
         SELECT r.* FROM reviews r
         ${SUBJECT_JOIN}
         WHERE ${conditions.join(' AND ')}
         ORDER BY r.updated_at DESC, r.did DESC, r.rkey DESC
         LIMIT ?
       ) r
       ${SUBJECT_JOIN}
       LEFT JOIN accounts a ON a.did = r.did
       JOIN review_tags t ON t.did = r.did AND t.rkey = r.rkey
       ORDER BY r.updated_at DESC, r.did DESC, r.rkey DESC, t.adjective`,
    )
    .all(...params, REVIEWS_PAGE_SIZE + 1) as unknown as ListRow[];

  const byRecord = new Map<string, ListedReview>();
  for (const row of rows) {
    const key = `${row.did}/${row.rkey}`;
    let review = byRecord.get(key);
    if (!review) {
      review = {
        did: row.did,
        handle: row.handle,
        rkey: row.rkey,
        ...rowSubject(row),
        tags: [],
        locale: row.locale || undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
      byRecord.set(key, review);
    }
    review.tags.push({ adjective: row.adjective, direction: row.direction });
  }

  const all = [...byRecord.values()];
  const hasMore = all.length > REVIEWS_PAGE_SIZE;
  const reviews = hasMore ? all.slice(0, REVIEWS_PAGE_SIZE) : all;
  const last = reviews[reviews.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeCursor({ updatedAt: last.updatedAt, did: last.did, rkey: last.rkey })
      : null;
  return { reviews, nextCursor };
}

/** The distinct subject types reviewed in scope, for the type filter's options. */
export function subjectTypesFor(scope: { did: string } | { all: true }): string[] {
  const conn = open();
  if (!conn) return [];
  const scoped = scopeClause(scope);
  const rows = conn
    .prepare(
      `SELECT DISTINCT COALESCE(s.type, r.subject_type) AS subject_type
       FROM reviews r ${SUBJECT_JOIN} WHERE ${scoped.sql} ORDER BY subject_type`,
    )
    .all(...scoped.params) as unknown as { subject_type: string }[];
  return rows.map((r) => r.subject_type);
}

export type AdjectiveCount = { adjective: string; count: number };

const ADJECTIVE_CLOUD_SIZE = 25;

/** The most-used adjectives in scope (up to `ADJECTIVE_CLOUD_SIZE`), for the adjective cloud. */
export function adjectiveCounts(scope: ReviewScope): AdjectiveCount[] {
  const conn = open();
  if (!conn) return [];
  const scoped = scopeClause(scope);
  return conn
    .prepare(
      `SELECT t.adjective, COUNT(*) AS count FROM review_tags t
       JOIN reviews r ON r.did = t.did AND r.rkey = t.rkey
       WHERE ${scoped.sql} GROUP BY t.adjective ORDER BY count DESC, t.adjective LIMIT ${ADJECTIVE_CLOUD_SIZE}`,
    )
    .all(...scoped.params) as unknown as AdjectiveCount[];
}

/** The reviewer's own review of a subject, if they have already reviewed it. */
/** A person's review of a subject in one locale (`''` for a review with none):
    reviews of the same subject in different locales are separate reviews. */
export function findReview(did: string, subjectUri: string, locale: string): ExistingReview | null {
  const conn = open();
  if (!conn) return null;
  const review = conn
    .prepare(
      `SELECT rkey, locale, created_at FROM reviews
       WHERE did = ? AND subject_uri = ? AND locale = ?
       ORDER BY updated_at DESC LIMIT 1`,
    )
    .get(did, subjectUri, locale) as
    | { rkey: string; locale: string; created_at: string }
    | undefined;
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
