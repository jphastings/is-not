import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { accountsFor, didHandle, handleDid } from '$lib/server/accounts';
import { adjectiveCounts, listReviews, subjectTypesFor } from '$lib/server/db';
import { deleteReview } from '$lib/server/deleteReview';
import { fetchLiveReview } from '$lib/server/liveReview';
import { COLLECTION } from '$lib/server/reviews';
import { RECORD_URI } from '$lib/review';

export const load: PageServerLoad = async ({ params, url, locals }) => {
  const { current } = await accountsFor(locals.browser);
  const viewer = current?.did ?? null;

  // A path segment can't hold `at://` verbatim — the empty segment between the
  // slashes is dropped by some clients — so rebuild the at-uri from whatever
  // survived.
  const id = params.id.startsWith('at:') ? params.id.replace(/^at:\/*/, 'at://') : params.id;

  if (id.startsWith('at://')) {
    const match = RECORD_URI.exec(id);
    if (!match) redirect(302, '/');
    const [, authority, collection, rkey] = match;

    // An at-uri naming a review record itself (not its subject) is the single
    // review's canonical URL.
    if (collection === COLLECTION) {
      if (!authority.startsWith('did:')) {
        const resolved = await handleDid(authority);
        if (!resolved) error(404);
        redirect(302, `/reviews/at://${resolved}/${COLLECTION}/${rkey}${url.search}`);
      }

      // ponytail: fetches every review by this did and filters in JS; a single
      // `WHERE did = ? AND rkey = ?` query is the upgrade once this needs to scale.
      // A miss falls back to a live PDS read: jetstream can be a second or two
      // behind a just-completed save, and that's exactly when this link is followed.
      const review =
        listReviews({ did: authority }).find((r) => r.rkey === rkey) ??
        (await fetchLiveReview(authority, rkey));
      if (!review) error(404);

      const adjective = url.searchParams.get('adjective');
      let tags = review.tags;
      if (adjective) {
        const matching = review.tags.filter((t) => t.adjective === adjective);
        tags = matching.length > 0 ? matching : [{ direction: 0, adjective }];
      }

      return {
        id,
        single: true as const,
        review: { ...review, tags },
        heading: review.handle ? `@${review.handle}` : review.did,
      };
    }

    const reviews = listReviews({ subjectUri: id });
    return {
      id,
      single: false as const,
      heading: reviews[0]?.subject.title ?? id,
      subjectType: reviews[0]?.subject.type ?? null,
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
    single: false as const,
    heading: `@${id.startsWith('did:') ? await didHandle(id) : id}`,
    subjectType: null,
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
