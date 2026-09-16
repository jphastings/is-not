import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { handleDid } from '$lib/server/accounts';
import { listReviews } from '$lib/server/db';

export const load: PageServerLoad = async ({ params, url }) => {
  if (!params.id.startsWith('did:')) {
    const resolved = await handleDid(params.id);
    if (!resolved) error(404);
    redirect(302, `/reviews/${resolved}/${params.rkey}${url.search}`);
  }

  // ponytail: fetches every review by this did and filters in JS; a single
  // `WHERE did = ? AND rkey = ?` query is the upgrade once this needs to scale.
  const review = listReviews({ did: params.id }).find((r) => r.rkey === params.rkey);
  if (!review) error(404);

  const adjective = url.searchParams.get('adjective');
  let tags = review.tags;
  if (adjective) {
    const matching = review.tags.filter((t) => t.adjective === adjective);
    tags = matching.length > 0 ? matching : [{ direction: 0, adjective }];
  }

  return {
    review: { ...review, tags },
    heading: review.handle ? `@${review.handle}` : review.did,
  };
};
