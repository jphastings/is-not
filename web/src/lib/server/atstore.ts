import type { Agent } from '@atproto/api';
import { findReview } from './db.ts';
import { earliest, listAll, type ImportRow, type ListedRecord } from './importers.ts';

const FAVORITE_COLLECTION = 'fyi.atstore.listing.favorite';
const REVIEW_COLLECTION = 'fyi.atstore.listing.review';

const isString = (v: unknown): v is string => typeof v === 'string';

// A 1-5 star rating isn't enforced at the source PDS, so clamp defensively
// rather than trust it (see docs/creating-a-lens.md on unvalidated records).
// A missing one reads as neutral (3) rather than NaN, which would clamp to
// NaN and only surface as a failed row at the end of the import.
function ratingSource(rating: number): string {
  if (!Number.isFinite(rating)) return '3';
  return String(Math.min(5, Math.max(1, Math.round(rating))));
}

/**
 * Reads the signed-in account's atstore.fyi favourites and reviews, grouped by the app
 * (fyi.atstore.listing.detail record) they're about, so each becomes one at.isnot.review
 * with one source per source record — the tag each source maps to is a client-side choice.
 */
export async function previewAtstoreImport(did: string, agent: Agent): Promise<ImportRow[]> {
  const [favorites, reviews] = await Promise.all([
    listAll(agent, did, FAVORITE_COLLECTION),
    listAll(agent, did, REVIEW_COLLECTION),
  ]);

  type Group = { sources: string[]; createdAt?: string };
  const bySubject = new Map<string, Group>();
  const add = (record: ListedRecord, source: string) => {
    const subjectUri = record.value.subject;
    if (!isString(subjectUri) || subjectUri === '') return;
    const entry = bySubject.get(subjectUri) ?? { sources: [] };
    entry.sources.push(source);
    entry.createdAt = earliest(entry.createdAt, record.value.createdAt);
    bySubject.set(subjectUri, entry);
  };

  for (const record of favorites) {
    add(record, 'favourite');
  }
  for (const record of reviews) {
    add(record, ratingSource(Number(record.value.rating)));
  }

  return [...bySubject.entries()].map(([subjectUri, { sources, createdAt }]) => ({
    subjectUri,
    sources,
    createdAt,
    existing: findReview(did, subjectUri)?.tags ?? null,
  }));
}
