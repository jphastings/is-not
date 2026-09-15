import { lookup } from 'node:dns/promises';
import { BlockList } from 'node:net';
import { checkSubjectUri } from '../review';

const MAX_BYTES = 512 * 1024;
const MAX_HOPS = 5;
const FETCH_TIMEOUT_MS = 5000;

// Addresses a page (or any of its redirects) must never resolve to: loopback,
// RFC1918 private space, link-local (169.254.169.254 is the cloud metadata
// address), both families' unspecified and multicast ranges, and IPv6
// unique-local.
const blockedAddresses = new BlockList();
blockedAddresses.addSubnet('127.0.0.0', 8, 'ipv4');
blockedAddresses.addSubnet('10.0.0.0', 8, 'ipv4');
blockedAddresses.addSubnet('172.16.0.0', 12, 'ipv4');
blockedAddresses.addSubnet('192.168.0.0', 16, 'ipv4');
blockedAddresses.addSubnet('169.254.0.0', 16, 'ipv4');
blockedAddresses.addAddress('0.0.0.0', 'ipv4');
blockedAddresses.addSubnet('224.0.0.0', 4, 'ipv4');
blockedAddresses.addAddress('::1', 'ipv6');
blockedAddresses.addSubnet('fc00::', 7, 'ipv6');
blockedAddresses.addSubnet('fe80::', 10, 'ipv6');
blockedAddresses.addAddress('::', 'ipv6');
blockedAddresses.addSubnet('ff00::', 8, 'ipv6');

// Detects IPv4-mapped IPv6 addresses (::ffff:0:0/96), rejected wholesale
// rather than unwrapped and re-checked against the IPv4 rules above — a
// public address has no reason to arrive in that form. Kept as its own
// BlockList: a `check(addr, 'ipv4')` call is answered against every rule in
// the *same* instance regardless of family, so adding this subnet next to
// the IPv4 rules above would make every IPv4 address matched via its
// IPv4-mapped equivalent, blocking them all.
const mappedIPv4 = new BlockList();
mappedIPv4.addSubnet('::ffff:0:0', 96, 'ipv6');

/** True only when every address the hostname resolves to is safe to fetch.
    Checking every resolved address (not just the first) stops a host that
    resolves to both a public and an internal address from sneaking through. */
async function isSafeUrl(url: URL): Promise<boolean> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  let addresses: { address: string; family: number }[];
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    return false; // doesn't resolve: nothing to fetch
  }
  return (
    addresses.length > 0 &&
    addresses.every(({ address, family }) => {
      if (family === 6 && mappedIPv4.check(address, 'ipv6')) return false;
      return !blockedAddresses.check(address, family === 6 ? 'ipv6' : 'ipv4');
    })
  );
}

/** Reads at most MAX_BYTES of the body. A timed-out or dropped connection
    mid-read just yields whatever arrived rather than throwing. */
async function readCapped(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  let received = 0;
  let text = '';
  try {
    while (received < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      text += decoder.decode(value, { stream: true });
    }
  } catch {
    // use whatever arrived before the drop or timeout
  } finally {
    reader.cancel().catch(() => {});
  }
  return text;
}

const META_TAG = /<meta\b[^>]*>/gi;
const ATTR = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;

/** Scans raw HTML for `<meta name="at:canonical" content="...">` tags
    without a parser: attribute order, quote style (or none) and casing all
    vary in the wild, so this reads attributes into a map per tag rather than
    assuming any fixed shape. Array semantics: every matching tag counts. */
export function extractCanonicalUris(html: string): string[] {
  const uris: string[] = [];
  for (const [tag] of html.matchAll(META_TAG)) {
    const attrs: Record<string, string> = {};
    for (const [, name, dq, sq, bare] of tag.matchAll(ATTR)) {
      attrs[name.toLowerCase()] = dq ?? sq ?? bare ?? '';
    }
    if (attrs.name?.toLowerCase() === 'at:canonical' && attrs.content) {
      uris.push(attrs.content.trim());
    }
  }
  return uris;
}

/**
 * Fetches a page server-side and returns the at-uris it declares via
 * `at:canonical` meta tags. Never throws, and never returns anything derived
 * from the fetch itself (body, headers, status, error detail) — only at-uris
 * that already pass `checkSubjectUri`, or an empty list. A redirect is
 * followed manually, re-validating the destination each hop, so a public URL
 * can't hand back an internal one partway through.
 */
export async function fetchCanonicalUris(rawUrl: string): Promise<string[]> {
  let current: URL;
  try {
    current = new URL(rawUrl);
  } catch {
    return [];
  }

  for (let hop = 0; hop < MAX_HOPS; hop++) {
    if (!(await isSafeUrl(current))) return [];

    let res: Response;
    try {
      res = await fetch(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch {
      return [];
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      res.body?.cancel().catch(() => {});
      if (!location) return [];
      try {
        current = new URL(location, current);
      } catch {
        return [];
      }
      continue;
    }

    if (!res.ok || !(res.headers.get('content-type') ?? '').toLowerCase().includes('text/html')) {
      res.body?.cancel().catch(() => {});
      return [];
    }

    const html = await readCapped(res);
    return extractCanonicalUris(html).filter((uri) => checkSubjectUri(uri) === null);
  }
  return [];
}
