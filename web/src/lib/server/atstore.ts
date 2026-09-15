import type { Agent } from '@atproto/api';
import type { Tag } from '@is-not/lenses';
import { findReview } from './db.ts';

const FAVORITE_COLLECTION = 'fyi.atstore.listing.favorite';
const REVIEW_COLLECTION = 'fyi.atstore.listing.review';

export type ImportRow = {
  subjectUri: string;
  tags: Tag[];
  isUpdate: boolean;
  /** The oldest source record's own createdAt: an imported opinion is that old. */
  createdAt?: string;
};

type ListedRecord = { uri: string; value: Record<string, unknown> };

const earliest = (a: string | undefined, b: unknown) =>
  isString(b) && !Number.isNaN(Date.parse(b)) && (a === undefined || b < a) ? b : a;

const isString = (v: unknown): v is string => typeof v === 'string';

async function listAll(agent: Agent, did: string, collection: string): Promise<ListedRecord[]> {
  const records: ListedRecord[] = [];
  let cursor: string | undefined;
  do {
    const res = await agent.com.atproto.repo.listRecords({
      repo: did,
      collection,
      cursor,
      limit: 100,
    });
    records.push(...(res.data.records as ListedRecord[]));
    cursor = res.data.cursor;
  } while (cursor);
  return records;
}

// A 1-5 star rating isn't enforced at the source PDS, so clamp defensively
// rather than trust it (see docs/creating-a-lens.md on unvalidated records).
// A missing one reads as no opinion rather than NaN, which would clamp to NaN
// and only surface as a failed row at the end of the import.
function ratingDirection(rating: number): Tag['direction'] {
  if (!Number.isFinite(rating)) return 0;
  return Math.min(2, Math.max(-2, Math.round(rating) - 3)) as Tag['direction'];
}

/**
 * Reads the signed-in account's atstore.fyi favourites and reviews, grouped by the app
 * (fyi.atstore.listing.detail record) they're about, so each becomes one at.isnot.review
 * with one tag per source record.
 */
export async function previewAtstoreImport(did: string, agent: Agent): Promise<ImportRow[]> {
  const [favorites, reviews] = await Promise.all([
    listAll(agent, did, FAVORITE_COLLECTION),
    listAll(agent, did, REVIEW_COLLECTION),
  ]);

  type Group = { tags: Tag[]; createdAt?: string };
  const bySubject = new Map<string, Group>();
  const add = (record: ListedRecord, tag: Tag) => {
    const subjectUri = record.value.subject;
    if (!isString(subjectUri) || subjectUri === '') return;
    const entry = bySubject.get(subjectUri) ?? { tags: [] };
    entry.tags.push(tag);
    entry.createdAt = earliest(entry.createdAt, record.value.createdAt);
    bySubject.set(subjectUri, entry);
  };

  for (const record of favorites) {
    add(record, { adjective: 'awesome', direction: 2 });
  }
  for (const record of reviews) {
    const rating = Number(record.value.rating);
    add(record, { adjective: 'good', direction: ratingDirection(rating) });
  }

  return [...bySubject.entries()].map(([subjectUri, { tags, createdAt }]) => ({
    subjectUri,
    tags,
    createdAt,
    isUpdate: findReview(did, subjectUri) !== null,
  }));
}
