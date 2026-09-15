import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

// Both processes run in one container: the Go API listens on PORT (default
// 8080), reachable at 127.0.0.1 without going through the public
// api.isnot.at domain.
const API_ORIGIN = env.API_ORIGIN ?? 'http://127.0.0.1:8080';

export const GET: RequestHandler = async ({ url, fetch }) => {
  const upstream = new URL('/xrpc/at.isnot.suggestSubjects', API_ORIGIN);
  upstream.search = url.search;
  try {
    const res = await fetch(upstream);
    if (res.ok) return json(await res.json());
  } catch {
    // fall through to empty suggestions below
  }
  return json({ subjects: [] });
};
