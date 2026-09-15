import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { accountsFor, didHandle, handleDid } from '$lib/server/accounts';
import { adjectiveCounts, listReviews, subjectTypesFor } from '$lib/server/db';
import { deleteReview } from '$lib/server/deleteReview';

export const load: PageServerLoad = async ({ params, url, locals }) => {
  let did = params.did;
  // /reviews/{handle} resolves to the canonical DID form; an unresolvable
  // handle falls through to the same empty state as an unknown DID.
  if (!did.startsWith('did:')) {
    const resolved = await handleDid(did);
    if (resolved) redirect(302, `/reviews/${resolved}${url.search}`);
  }

  const type = url.searchParams.get('type') || undefined;
  const adjective = url.searchParams.get('adjective') || undefined;
  const { current } = await accountsFor(locals.browser);

  return {
    did,
    handle: did.startsWith('did:') ? await didHandle(did) : did,
    reviews: listReviews(did, { type, adjective }),
    types: subjectTypesFor(did),
    adjectives: adjectiveCounts(did),
    filters: { type: type ?? null, adjective: adjective ?? null },
    editable: current?.did === did,
  };
};

export const actions: Actions = {
  delete: async ({ request, locals, params }) => {
    const did = locals.browser?.current;
    if (!did || did !== params.did) return fail(401, { error: 'signin' });
    const rkey = String((await request.formData()).get('rkey') ?? '');
    if (!rkey) return fail(400, { error: 'rkey' });
    const result = await deleteReview(did, rkey);
    return result.ok ? { deleted: rkey } : fail(result.status, { error: result.error });
  },
};
