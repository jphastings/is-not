import { createHash } from 'node:crypto';
import { base58btc } from 'multiformats/bases/base58';
import { handleDid } from './accounts.ts';

const SHA256_MULTIHASH_PREFIX = Uint8Array.from([0x12, 0x20]);

/**
 * A review's rkey is derived from its subject, not chosen: base58btc (no
 * multibase prefix) of the sha2-256 multihash of the subject's at-uri. Same
 * subject, same reviewer's DID in that uri, always the same address — no
 * lookup needed to find a review, and at most one review per subject per repo.
 */
export function reviewRkey(subjectUri: string): string {
  const digest = createHash('sha256').update(subjectUri, 'utf8').digest();
  const multihash = new Uint8Array(SHA256_MULTIHASH_PREFIX.length + digest.length);
  multihash.set(SHA256_MULTIHASH_PREFIX);
  multihash.set(digest, SHA256_MULTIHASH_PREFIX.length);
  return base58btc.baseEncode(multihash);
}

const AUTHORITY = /^at:\/\/([^/]+)(\/.*)$/;

/**
 * Rewrites a subject's at-uri so its authority is always a DID: a handle
 * authority is resolved and the uri rebuilt, a DID authority is returned
 * trimmed and otherwise unchanged. Two subjects that name the same record by
 * handle and by DID must hash to the same rkey.
 */
export async function normaliseSubjectUri(uri: string): Promise<string | null> {
  const trimmed = uri.trim();
  const match = AUTHORITY.exec(trimmed);
  if (!match) return null;
  const [, authority, rest] = match;
  if (authority.startsWith('did:')) return trimmed;
  const did = await handleDid(authority);
  return did ? `at://${did}${rest}` : null;
}
