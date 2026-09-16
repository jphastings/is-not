import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { accountsFor, didHandle, handleDid } from '$lib/server/accounts';
import { adjectiveCounts, listReviews, subjectTypesFor } from '$lib/server/db';
import { deleteReview } from '$lib/server/deleteReview';
import { RECORD_URI } from '$lib/review';

export const load: PageServerLoad = async ({ params, url, locals }) => {
  const { current } = await accountsFor(locals.browser);
  const viewer = current?.did ?? null;

  // A path segment can't hold `at://` verbatim — the empty segment between the
  // slashes is dropped by some clients — so rebuild the at-uri from whatever
  // survived.
  const id = params.id.startsWith('at:') ? params.id.replace(/^at:\/*/, 'at://') : params.id;

  if (id.startsWith('at://')) {
    if (!RECORD_URI.test(id)) redirect(302, '/');
    const reviews = listReviews({ subjectUri: id });
    return {
      id,
      heading: reviews[0]?.subject.title ?? id,
      ofSubject: true,
      reviews,
      types: [],
      adjectives: adjectiveCounts({ subjectUri: id }),
      viewer,
    };
  }

  // /reviews/{handle} resolves to the canonical DID form; an unresolvable
  // handle falls through to the same empty state as an unknown DID.
  if (!id.startsWith('did:')) {
    const resolved = await handleDid(id);
    if (resolved) redirect(302, `/reviews/${resolved}${url.search}`);
  }

  return {
    id,
    heading: `@${id.startsWith('did:') ? await didHandle(id) : id}`,
    ofSubject: false,
    reviews: listReviews({ did: id }),
    types: subjectTypesFor(id),
    adjectives: adjectiveCounts({ did: id }),
    viewer,
  };
};

export const actions: Actions = {
  delete: async ({ request, locals }) => {
    const did = locals.browser?.current;
    if (!did) return fail(401, { error: 'signin' });
    const rkey = String((await request.formData()).get('rkey') ?? '');
    if (!rkey) return fail(400, { error: 'rkey' });
    const result = await deleteReview(did, rkey);
    return result.ok ? { deleted: rkey } : fail(result.status, { error: result.error });
  },
};
