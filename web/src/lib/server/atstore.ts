import type { Agent } from '@atproto/api';
import { fetchRecord, loadLenses } from '@is-not/lenses';
import type { Subject, Tag } from '@is-not/lenses';
import { findReview } from './db.ts';

const FAVORITE_COLLECTION = 'fyi.atstore.listing.favorite';
const REVIEW_COLLECTION = 'fyi.atstore.listing.review';

export type ImportSource = { collection: 'favorite' | 'review'; uri: string; rating?: number };

export type ImportRow = {
  subjectUri: string;
  subject: Subject | null;
  error: string | null;
  tags: Tag[];
  sources: ImportSource[];
  isUpdate: boolean;
};

type ListedRecord = { uri: string; value: Record<string, unknown> };

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
function ratingDirection(rating: number): Tag['direction'] {
  return Math.min(2, Math.max(-2, Math.round(rating) - 3)) as Tag['direction'];
}

let lenses: ReturnType<typeof loadLenses> | undefined;

/** Resolves a fyi.atstore.listing.detail record to a review subject, in Node. */
async function resolveDetail(uri: string) {
  lenses ??= loadLenses();
  const [engine, { cid, record }] = await Promise.all([lenses, fetchRecord(uri)]);
  return engine.resolveSubject({ uri, cid, record });
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

  const bySubject = new Map<string, { tags: Tag[]; sources: ImportSource[] }>();
  const add = (subjectUri: unknown, tag: Tag, source: ImportSource) => {
    if (typeof subjectUri !== 'string' || subjectUri === '') return;
    const entry = bySubject.get(subjectUri) ?? { tags: [], sources: [] };
    entry.tags.push(tag);
    entry.sources.push(source);
    bySubject.set(subjectUri, entry);
  };

  for (const record of favorites) {
    add(
      record.value.subject,
      { adjective: 'awesome', direction: 2 },
      {
        collection: 'favorite',
        uri: record.uri,
      },
    );
  }
  for (const record of reviews) {
    const rating = Number(record.value.rating);
    add(
      record.value.subject,
      { adjective: 'good', direction: ratingDirection(rating) },
      {
        collection: 'review',
        uri: record.uri,
        rating,
      },
    );
  }

  return Promise.all(
    [...bySubject.entries()].map(async ([subjectUri, { tags, sources }]) => {
      try {
        const resolution = await resolveDetail(subjectUri);
        if ('error' in resolution) {
          return {
            subjectUri,
            subject: null,
            error: resolution.error,
            tags,
            sources,
            isUpdate: false,
          };
        }
        return {
          subjectUri,
          subject: resolution.subject,
          error: null,
          tags,
          sources,
          isUpdate: findReview(did, subjectUri) !== null,
        };
      } catch (e) {
        return {
          subjectUri,
          subject: null,
          error: e instanceof Error ? e.message : 'unresolved',
          tags,
          sources,
          isUpdate: false,
        };
      }
    }),
  );
}
