import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { COLLECTION } from '$lib/server/reviews';

// Superseded by the at-uri form at /reviews/[...id]; that route resolves a
// handle or missing review itself, so this just rebuilds the at-uri and lets
// it take over.
export const load: PageServerLoad = ({ params, url }) => {
  redirect(308, `/reviews/at://${params.id}/${COLLECTION}/${params.rkey}${url.search}`);
};
