import { error, fail, redirect } from '@sveltejs/kit';
import { reviewSentence, sentenceText } from '@is-not/sentence';
import type { Actions, PageServerLoad } from './$types';
import { accountsFor, didHandle, handleDid } from '$lib/server/accounts';
import { adjectiveCounts, listReviews, subjectTypesFor } from '$lib/server/db';
import { deleteReview } from '$lib/server/deleteReview';
import { COLLECTION, singleReview } from '$lib/server/reviews';
import { subjectPhrase } from '$lib/server/og';
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

      const adjective = url.searchParams.get('adjective');
      const review = await singleReview(authority, rkey, adjective);
      if (!review) error(404);

      const ogParams = new URLSearchParams({ review: id });
      if (adjective) ogParams.set('adjective', adjective);

      return {
        id,
        single: true as const,
        review,
        heading: review.handle ? `@${review.handle}` : review.did,
        ogImage: `/og.png?${ogParams}`,
        ogDescription: sentenceText(
          reviewSentence(
            { subject: review.subject, tags: review.tags, locale: review.locale },
            { who: { handle: review.handle || review.did, did: review.did } },
          ),
        ),
      };
    }

    const reviews = listReviews({ subjectUri: id });
    return {
      id,
      single: false as const,
      heading: reviews[0]?.subject.title ?? null,
      subjectType: reviews[0]?.subject.type ?? null,
      ofSubject: true,
      reviews,
      types: [],
      adjectives: adjectiveCounts({ subjectUri: id }),
      viewer,
      ...(reviews.length > 0
        ? {
            ogImage: `/og.png?subject=${encodeURIComponent(id)}`,
            ogDescription: sentenceText(
              subjectPhrase(
                reviews[0].subject,
                reviews.flatMap((r) => r.tags),
              ),
            ),
          }
        : {}),
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
