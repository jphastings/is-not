import { fail } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
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

/** Shared `?/delete` action body: a review's own page and /review's editable
    row both delete by rkey the same way, so it lives once here. */
export async function deleteReviewAction({ request, locals }: RequestEvent) {
  const did = locals.browser?.current;
  if (!did) return fail(401, { error: 'signin' });
  const rkey = String((await request.formData()).get('rkey') ?? '');
  if (!rkey) return fail(400, { error: 'rkey' });
  const result = await deleteReview(did, rkey);
  return result.ok ? { deleted: rkey } : fail(result.status, { error: result.error });
}
