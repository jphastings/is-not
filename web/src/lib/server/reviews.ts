import { TID } from '@atproto/common-web';
import type { Tag } from '@is-not/lenses';
import { agentFor } from './accounts.ts';
import { findReview } from './db.ts';
import { mergeTags, type ReviewInput } from '$lib/review';

export const COLLECTION = 'at.isnot.review';

export type SaveResult = { ok: true; uri: string } | { ok: false; status: number; error: string };

/**
 * Write one person's opinion of one subject, as the single record this site
 * allows per subject per repo: an existing review is merged into and updated in
 * place, a new one is created.
 */
export async function saveReview(did: string, input: ReviewInput): Promise<SaveResult> {
  const { subject, tags, locale, prefilled = [] } = input;
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
    createdAt: existing?.createdAt ?? now,
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
