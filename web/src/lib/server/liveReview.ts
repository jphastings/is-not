import { docHandle, resolveDidDoc, type DidDoc } from './accounts';
import { guardedFetchJson } from './canonical';
import { validateReview } from '../review';
import type { ListedReview } from './db';

const COLLECTION = 'at.isnot.review';
// Two sequential HTTPS round trips (DID doc, then the PDS itself) to hosts
// this process has no connection pooled for yet — each one measured 600-800ms
// even to a nearby, healthy host, TLS handshake included. 1.5s sounded rapid
// on paper but clipped a successful pair of requests in practice; this still
// bounds the wait to a few seconds, never a hang.
const DEADLINE_MS = 3000;

function pdsEndpoint(doc: DidDoc): string | null {
  const service = doc.service?.find((s) => s.id?.endsWith('#atproto_pds'));
  return typeof service?.serviceEndpoint === 'string' ? service.serviceEndpoint : null;
}

/** Builds the ListedReview shape straight from a validated PDS record —
    everything the sentence needs, nothing the DB would add. Subject and tags
    reuse the same validation the save form applies to untrusted input;
    created/updated are cosmetic here so a missing or malformed date doesn't
    sink an otherwise-valid record. */
export function toListedReview(did: string, rkey: string, record: unknown): ListedReview | null {
  const parsed = validateReview(record);
  if (!parsed.ok) return null;
  const dates = record as { createdAt?: unknown; updatedAt?: unknown };
  return {
    did,
    handle: '',
    rkey,
    subject: parsed.value.subject,
    tags: parsed.value.tags,
    locale: parsed.value.locale,
    createdAt: typeof dates.createdAt === 'string' ? dates.createdAt : '',
    updatedAt: typeof dates.updatedAt === 'string' ? dates.updatedAt : '',
    stale: false,
  };
}

/**
 * Falls back to a direct PDS read for a review jetstream hasn't ingested yet:
 * saving redirects straight to the review's canonical URL, a second or two
 * before the ingester has written it locally. One deadline covers the DID
 * doc lookup and the PDS read together; any miss, timeout, or invalid shape
 * reads as not-found, same as a genuinely missing review — never a 500 or a
 * hang. Never writes to the DB; the ingester owns that.
 *
 * The PDS endpoint comes from the DID document, which its owner controls, so
 * `guardedFetchJson` (not a bare fetch) is what actually reaches it.
 */
export async function fetchLiveReview(did: string, rkey: string): Promise<ListedReview | null> {
  const signal = AbortSignal.timeout(DEADLINE_MS);
  const doc = await resolveDidDoc(did, signal);
  const endpoint = doc && pdsEndpoint(doc);
  if (!endpoint) return null;

  let url: URL;
  try {
    url = new URL('/xrpc/com.atproto.repo.getRecord', endpoint);
  } catch {
    return null;
  }
  url.searchParams.set('repo', did);
  url.searchParams.set('collection', COLLECTION);
  url.searchParams.set('rkey', rkey);

  const body = await guardedFetchJson(url.toString(), signal);
  if (typeof body !== 'object' || body === null) return null;
  const review = toListedReview(did, rkey, (body as { value?: unknown }).value);
  return review && { ...review, handle: docHandle(doc) };
}
