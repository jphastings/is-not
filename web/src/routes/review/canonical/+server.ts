import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchCanonicalUris } from '$lib/server/canonical';

// The browser can't read a third-party page's HTML itself (CORS), so it asks
// this route to fetch it instead. fetchCanonicalUris is the trust boundary:
// it never throws and never surfaces the fetch itself, only the at-uris.
export const GET: RequestHandler = async ({ url }) => {
  const target = url.searchParams.get('url');
  if (!target) return json({ uris: [] });
  try {
    return json({ uris: await fetchCanonicalUris(target) });
  } catch (e) {
    console.error('canonical fetch failed', target, e);
    return json({ uris: [] });
  }
};
