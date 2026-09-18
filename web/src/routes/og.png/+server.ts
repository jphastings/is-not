import { reviewSentence } from '@is-not/sentence';
import type { RequestHandler } from './$types';
import { RECORD_URI } from '$lib/review';
import { COLLECTION, singleReview } from '$lib/server/reviews';
import { listReviews } from '$lib/server/db';
import { defaultPhrase, phrasePng, subjectPhrase } from '$lib/server/og';

const TAGLINE = 'Simple, nuanced micro-reviewing';
const HEADERS = { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' };

let defaultPng: Promise<Uint8Array> | undefined;
function defaultCard(): Promise<Uint8Array> {
  return (defaultPng ??= phrasePng(defaultPhrase(), { tagline: TAGLINE }));
}

async function reviewCard(uri: string, adjective: string | null): Promise<Uint8Array | undefined> {
  const match = RECORD_URI.exec(uri.trim());
  if (!match) return undefined;
  const [, did, collection, rkey] = match;
  if (collection !== COLLECTION || !did.startsWith('did:')) return undefined;
  const review = await singleReview(did, rkey, adjective);
  if (!review) return undefined;
  const parts = reviewSentence(
    { subject: review.subject, tags: review.tags, locale: review.locale },
    { who: { handle: review.handle, did: review.did } },
  );
  return phrasePng(parts);
}

async function subjectCard(uri: string): Promise<Uint8Array | undefined> {
  const match = RECORD_URI.exec(uri.trim());
  if (!match) return undefined;
  const [, , collection] = match;
  if (collection === COLLECTION) return undefined;
  const reviews = listReviews({ subjectUri: uri });
  if (reviews.length === 0) return undefined;
  const parts = subjectPhrase(
    reviews[0].subject,
    reviews.flatMap((r) => r.tags),
  );
  return phrasePng(parts);
}

export const GET: RequestHandler = async ({ url }) => {
  const reviewUri = url.searchParams.get('review');
  const subjectUri = url.searchParams.get('subject');
  const png = reviewUri
    ? await reviewCard(reviewUri, url.searchParams.get('adjective'))
    : subjectUri
      ? await subjectCard(subjectUri)
      : undefined;
  const bytes = png ?? (await defaultCard());
  // A plain ArrayBuffer copy, not the Uint8Array itself: BodyInit's ArrayBufferView
  // branch and this TypeScript's generic Uint8Array<ArrayBufferLike> don't agree.
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Response(buffer, { headers: HEADERS });
};
