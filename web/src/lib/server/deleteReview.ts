import { agentFor } from './accounts.ts';
import { COLLECTION } from './reviews.ts';

export type DeleteResult = { ok: true } | { ok: false; status: number; error: string };

/** Deletes an at.isnot.review record outright: used when a review's last tag is removed. */
export async function deleteReview(did: string, rkey: string): Promise<DeleteResult> {
  const agent = await agentFor(did);
  if (!agent) return { ok: false, status: 401, error: 'signin' };
  try {
    await agent.com.atproto.repo.deleteRecord({ repo: did, collection: COLLECTION, rkey });
    return { ok: true };
  } catch (e) {
    console.error('delete failed', e);
    return { ok: false, status: 502, error: 'pds' };
  }
}
