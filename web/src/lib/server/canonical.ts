import { lookup as lookupAsync } from 'node:dns/promises';
import { lookup as lookupCb, type LookupOptions } from 'node:dns';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, type LookupFunction } from 'node:net';
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

function isAllowedAddress(address: string, family: number): boolean {
  if (family === 6 && mappedIPv4.check(address, 'ipv6')) return false;
  return !blockedAddresses.check(address, family === 6 ? 'ipv6' : 'ipv4');
}

/**
 * The lookup the socket itself uses, so the addresses vetted here are the ones
 * connected to. Validating separately and then handing the hostname to a client
 * that resolves it again leaves a gap wide enough to drive a DNS rebind through:
 * a name under the caller's control can answer with a public address for the
 * check and a loopback one a moment later for the connection.
 */
const guardedLookup: LookupFunction = (hostname, options, callback) => {
  const opts = (typeof options === 'object' && options !== null ? options : {}) as LookupOptions;
  lookupCb(hostname, { ...opts, all: true, verbatim: true }, (err, addresses) => {
    const cb = callback as (
      err: NodeJS.ErrnoException | null,
      address?: unknown,
      family?: number,
    ) => void;
    if (err) return cb(err);
    if (addresses.length === 0 || !addresses.every((a) => isAllowedAddress(a.address, a.family))) {
      return cb(Object.assign(new Error('blocked address'), { code: 'EACCES' }));
    }
    if (opts.all) return cb(null, addresses);
    cb(null, addresses[0].address, addresses[0].family);
  });
};

/** A cheap pre-flight that rejects an obviously unreachable target before a
    socket is opened. `guardedLookup` is what actually holds the line. */
async function isSafeUrl(url: URL): Promise<boolean> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  try {
    const addresses = await lookupAsync(hostname, { all: true, verbatim: true });
    return addresses.length > 0 && addresses.every((a) => isAllowedAddress(a.address, a.family));
  } catch {
    return false; // doesn't resolve: nothing to fetch
  }
}

type Fetched = { status: number; location: string | null; contentType: string; body: string };

/**
 * One GET over node's own http client, which takes the `lookup` that fetch has
 * no way to accept, never follows a redirect on its own, and lets the body be
 * abandoned once MAX_BYTES have arrived. Resolves to null for anything that
 * goes wrong, so no detail of the failure can reach the caller.
 */
function get(url: URL): Promise<Fetched | null> {
  const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
  return new Promise((resolve) => {
    let settled = false;
    const done = (value: Fetched | null) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    const req = send(
      url,
      { method: 'GET', lookup: guardedLookup, timeout: FETCH_TIMEOUT_MS },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = res.headers.location ?? null;
        const contentType = String(res.headers['content-type'] ?? '').toLowerCase();
        if (status >= 300 || !contentType.includes('text/html')) {
          res.destroy();
          done({ status, location, contentType, body: '' });
          return;
        }
        const decoder = new TextDecoder();
        let received = 0;
        let body = '';
        res.on('data', (chunk: Buffer) => {
          received += chunk.byteLength;
          body += decoder.decode(chunk, { stream: true });
          if (received >= MAX_BYTES) res.destroy();
        });
        res.on('end', () => done({ status, location, contentType, body }));
        res.on('error', () => done({ status, location, contentType, body }));
        res.on('close', () => done({ status, location, contentType, body }));
      },
    );
    req.on('timeout', () => {
      req.destroy();
      done(null);
    });
    req.on('error', () => done(null));
    req.end();
  });
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

    const res = await get(current);
    if (!res) return [];

    if (res.status >= 300 && res.status < 400) {
      if (!res.location) return [];
      try {
        current = new URL(res.location, current);
      } catch {
        return [];
      }
      continue;
    }

    if (res.status < 200 || res.status >= 300 || !res.contentType.includes('text/html')) return [];

    return extractCanonicalUris(res.body).filter((uri) => checkSubjectUri(uri) === null);
  }
  return [];
}
