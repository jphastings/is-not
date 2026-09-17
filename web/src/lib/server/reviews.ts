import { TID } from '@atproto/common-web';
import type { Tag } from '@is-not/lenses';
import { agentFor } from './accounts.ts';
import { findReview, listReviews, type ListedReview } from './db.ts';
import { fetchLiveReview } from './liveReview.ts';
import { mergeTags, type ReviewInput } from '$lib/review';

export const COLLECTION = 'at.isnot.review';

export type SaveResult = { ok: true; uri: string } | { ok: false; status: number; error: string };

/**
 * Finds one person's review of one subject: jetstream's ingest first, then a
 * live PDS read for one saved a moment before ingestion caught up (same
 * fallback `saveReview`'s redirect relies on). When `adjective` narrows to
 * tags the review doesn't have, a lone placeholder tag stands in so the page
 * still has something to show rather than 404ing on a stale link.
 */
export async function singleReview(
  did: string,
  rkey: string,
  adjective?: string | null,
): Promise<ListedReview | null> {
  const review =
    listReviews({ did }).find((r) => r.rkey === rkey) ?? (await fetchLiveReview(did, rkey));
  if (!review || !adjective) return review;
  const matching = review.tags.filter((t) => t.adjective === adjective);
  return { ...review, tags: matching.length > 0 ? matching : [{ direction: 0, adjective }] };
}

/**
 * Write one person's opinion of one subject, as the single record this site
 * allows per subject per repo: an existing review is merged into and updated in
 * place, a new one is created.
 */
export async function saveReview(did: string, input: ReviewInput): Promise<SaveResult> {
  const { subject, tags, locale, prefilled = [], createdAt } = input;
  const existing = findReview(did, subject.uri, locale ?? '');
  // One review per subject and locale per person: a new opinion joins the record already there.
  const merged: Tag[] = existing ? mergeTags(existing.tags, tags, prefilled) : tags;
  if (merged.length > 32) return { ok: false, status: 400, error: 'tags' };
  const now = new Date().toISOString();
  const record = {
    $type: COLLECTION,
    subject,
    tags: merged,
    ...(locale ? { locale } : {}),
    createdAt: existing?.createdAt ?? createdAt ?? now,
    updatedAt: now,
  };
  const agent = await agentFor(did);
  if (!agent) return { ok: false, status: 401, error: 'signin' };
  try {
    const rkey = existing?.rkey ?? TID.nextStr();
    const write = { repo: did, collection: COLLECTION, rkey, record };
    const res = existing
      ? await agent.com.atproto.repo.putRecord(write)
      : await agent.com.atproto.repo.createRecord(write);
    return { ok: true, uri: res.data.uri };
  } catch (e) {
    console.error('save failed', e);
    return { ok: false, status: 502, error: 'pds' };
  }
}
