import type { Agent } from '@atproto/api';
import { findReview } from './db.ts';
import { earliest, listAll, type ImportRow } from './importers.ts';

const COLLECTION = 'social.popfeed.feed.review';

// rating is documented as 0-10 but unvalidated at the source, so clamp
// defensively rather than trust it (see docs/creating-a-lens.md).
function ratingSource(rating: number): string {
  return String(Math.min(10, Math.max(0, Math.round(rating))));
}

/**
 * Reads the signed-in account's social.popfeed.feed.review records. Like
 * bookhive, each review record already is the subject, so it's one row per
 * record — records with a non-finite rating (unvalidated at the source) are
 * skipped rather than guessed at.
 */
export async function previewPopfeedImport(
  did: string,
  agent: Agent,
  locale: string,
): Promise<ImportRow[]> {
  const records = await listAll(agent, did, COLLECTION);
  const rows: ImportRow[] = [];
  for (const record of records) {
    const rating = record.value.rating;
    if (typeof rating !== 'number' || !Number.isFinite(rating)) continue;
    rows.push({
      subjectUri: record.uri,
      sources: [ratingSource(rating)],
      createdAt: earliest(undefined, record.value.createdAt),
      existing: findReview(did, record.uri, locale)?.tags ?? null,
    });
  }
  return rows;
}
