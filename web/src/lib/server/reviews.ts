import type { Tag } from '@is-not/lenses';
import { agentFor } from './accounts.ts';
import { findReview, listReviews, type ListedReview } from './db.ts';
import { fetchLiveReview } from './liveReview.ts';
import { normaliseSubjectUri, reviewRkey } from './rkey.ts';
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
 * allows per subject per repo: an existing review is merged into and updated
 * in place, a new one is created. The rkey is derived from the subject
 * (`rkey.ts`), not chosen, so a legacy TID-keyed review found at the old rkey
 * is moved to the deterministic one rather than updated in place.
 */
export async function saveReview(did: string, input: ReviewInput): Promise<SaveResult> {
  const { subject, tags, locale, prefilled = [], createdAt } = input;
  const normalisedUri = await normaliseSubjectUri(subject.uri);
  if (!normalisedUri) return { ok: false, status: 400, error: 'subject' };
  const rkey = reviewRkey(normalisedUri);

  const existing = findReview(did, subject.uri);
  // One review per subject per person: a new opinion joins the record already there.
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
    if (existing && existing.rkey !== rkey) {
      await agent.com.atproto.repo.applyWrites({
        repo: did,
        writes: [
          {
            $type: 'com.atproto.repo.applyWrites#create',
            collection: COLLECTION,
            rkey,
            value: record,
          },
          {
            $type: 'com.atproto.repo.applyWrites#delete',
            collection: COLLECTION,
            rkey: existing.rkey,
          },
        ],
      });
      return { ok: true, uri: `at://${did}/${COLLECTION}/${rkey}` };
    }
    const res = await agent.com.atproto.repo.putRecord({
      repo: did,
      collection: COLLECTION,
      rkey,
      record,
    });
    return { ok: true, uri: res.data.uri };
  } catch (e) {
    console.error('save failed', e);
    return { ok: false, status: 502, error: 'pds' };
  }
}
