import type { Agent } from '@atproto/api';
import { findReview } from './db.ts';
import { earliest, listAll, type ImportRow } from './importers.ts';

const COLLECTION = 'buzz.bookhive.book';

// stars is documented as 1-10 but unvalidated at the source, so clamp
// defensively rather than trust it (see docs/creating-a-lens.md).
function starsSource(stars: number): string {
  return String(Math.min(10, Math.max(1, Math.round(stars))));
}

/**
 * Reads the signed-in account's buzz.bookhive.book records that carry a
 * rating — a want-to-read book has no opinion, so it's skipped. Unlike
 * atstore.fyi's cross-collection grouping, each book record already is the
 * review subject, so it's one row per record.
 */
export async function previewBookhiveImport(
  did: string,
  agent: Agent,
  locale: string,
): Promise<ImportRow[]> {
  const records = await listAll(agent, did, COLLECTION);
  const rows: ImportRow[] = [];
  for (const record of records) {
    const stars = record.value.stars;
    if (typeof stars !== 'number' || !Number.isFinite(stars)) continue;
    rows.push({
      subjectUri: record.uri,
      sources: [starsSource(stars)],
      createdAt: earliest(undefined, record.value.createdAt),
      existing: findReview(did, record.uri, locale)?.tags ?? null,
    });
  }
  return rows;
}
