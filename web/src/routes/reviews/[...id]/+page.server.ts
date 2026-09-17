import { error, fail, redirect } from '@sveltejs/kit';
import { reviewSentence, sentenceText, type Direction } from '@is-not/sentence';
import type { Actions, PageServerLoad } from './$types';
import { accountsFor, didHandle, handleDid } from '$lib/server/accounts';
import {
  adjectiveCounts,
  decodeCursor,
  listReviews,
  listReviewsPage,
  subjectTypesFor,
  type ReviewFilters,
} from '$lib/server/db';
import { deleteReview } from '$lib/server/deleteReview';
import { COLLECTION, singleReview } from '$lib/server/reviews';
import { subjectPhrase } from '$lib/server/og';
import { RECORD_URI } from '$lib/review';
import { m } from '$lib/paraglide/messages.js';

const ALL_DIRECTIONS: Direction[] = [2, 1, 0, -1, -2];

type Filters = { type: string | null; adjective: string | null; directions: Direction[] };

function parseDirections(url: URL): Direction[] {
  const raw = url.searchParams.getAll('direction').map(Number);
  const valid = raw.filter((n): n is Direction => (ALL_DIRECTIONS as number[]).includes(n));
  return valid.length ? valid : ALL_DIRECTIONS;
}

function parseFilters(url: URL): Filters {
  return {
    type: url.searchParams.get('type'),
    adjective: url.searchParams.get('adjective'),
    directions: parseDirections(url),
  };
}

/** The subset of `filters` worth sending to the query — an unset field, or every
    direction enabled, means "no restriction" and is left out entirely. */
function pageFilters(filters: Filters): ReviewFilters {
  return {
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.adjective ? { adjective: filters.adjective } : {}),
    ...(filters.directions.length < ALL_DIRECTIONS.length
      ? { directions: filters.directions }
      : {}),
  };
}

export const load: PageServerLoad = async ({ params, url, locals }) => {
  const { current } = await accountsFor(locals.browser);
  const viewer = current?.did ?? null;

  // A path segment can't hold `at://` verbatim — the empty segment between the
  // slashes is dropped by some clients — so rebuild the at-uri from whatever
  // survived.
  const id = params.id.startsWith('at:') ? params.id.replace(/^at:\/*/, 'at://') : params.id;

  const filters = parseFilters(url);
  const cursor = decodeCursor(url.searchParams.get('cursor'));

  // /reviews/ with nothing after it: every review in the database.
  if (id === '') {
    const { reviews, nextCursor } = listReviewsPage({ all: true }, pageFilters(filters), cursor);
    return {
      id,
      single: false as const,
      heading: m.reviews_all_heading(),
      subjectType: null,
      subject: null,
      ofSubject: false,
      showWho: true,
      showType: true,
      reviews,
      types: subjectTypesFor({ all: true }),
      adjectives: adjectiveCounts({ all: true }),
      viewer,
      filters,
      cursor: url.searchParams.get('cursor'),
      nextCursor,
      description: m.meta_reviews_all(),
    };
  }

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
        description: m.meta_review({
          sentence: sentenceText(
            reviewSentence(
              { subject: review.subject, tags: review.tags, locale: review.locale },
              { who: { handle: review.handle || review.did, did: review.did } },
            ),
          ),
        }),
      };
    }

    // The consensus description/image need every review of the subject, not
    // just the page being shown, so this is a separate, unpaginated query.
    const allReviews = listReviews({ subjectUri: id });
    const { reviews, nextCursor } = listReviewsPage(
      { subjectUri: id },
      pageFilters(filters),
      cursor,
    );
    return {
      id,
      single: false as const,
      heading: allReviews[0]?.subject.title ?? null,
      subjectType: allReviews[0]?.subject.type ?? null,
      subject: allReviews[0]?.subject ?? null,
      ofSubject: true,
      showWho: true,
      showType: false,
      reviews,
      types: [],
      adjectives: adjectiveCounts({ subjectUri: id }),
      viewer,
      filters,
      cursor: url.searchParams.get('cursor'),
      nextCursor,
      ...(allReviews.length > 0
        ? {
            ogImage: `/og.png?subject=${encodeURIComponent(id)}`,
            description: subjectDescription(allReviews),
          }
        : { description: m.meta_subject_empty() }),
    };
  }

  // /reviews/{handle} resolves to the canonical DID form; an unresolvable
  // handle falls through to the same empty state as an unknown DID.
  if (!id.startsWith('did:')) {
    const resolved = await handleDid(id);
    if (resolved) redirect(302, `/reviews/${resolved}${url.search}`);
  }

  const heading = `@${id.startsWith('did:') ? await didHandle(id) : id}`;
  const { reviews, nextCursor } = listReviewsPage({ did: id }, pageFilters(filters), cursor);
  return {
    id,
    single: false as const,
    heading,
    description: m.meta_person({ who: heading }),
    subjectType: null,
    subject: null,
    ofSubject: false,
    showWho: false,
    showType: true,
    reviews,
    types: subjectTypesFor({ did: id }),
    adjectives: adjectiveCounts({ did: id }),
    viewer,
    filters,
    cursor: url.searchParams.get('cursor'),
    nextCursor,
  };
};

function subjectDescription(reviews: ReturnType<typeof listReviews>): string {
  const sentence = sentenceText(
    subjectPhrase(
      reviews[0].subject,
      reviews.flatMap((r) => r.tags),
    ),
  );
  return reviews.length === 1
    ? m.meta_subject_one({ sentence })
    : m.meta_subject_many({ sentence, count: reviews.length });
}

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
