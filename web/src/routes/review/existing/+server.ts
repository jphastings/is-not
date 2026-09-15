import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { findReview } from '$lib/server/db';

export const GET: RequestHandler = ({ locals, url }) => {
  const did = locals.browser?.current;
  if (!did) return json(null);
  const uri = url.searchParams.get('uri');
  if (!uri) return json(null);
  return json(findReview(did, uri));
};
