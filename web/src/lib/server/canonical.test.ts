import { EventEmitter } from 'node:events';
import type { LookupFunction } from 'node:net';
import { describe, expect, it, vi } from 'vite-plus/test';
import { extractCanonicalUris } from './canonical.ts';

describe('extractCanonicalUris', () => {
  it('reads a straightforward tag', () => {
    const html = '<meta name="at:canonical" content="at://did:plc:x/site.doc/1" />';
    expect(extractCanonicalUris(html)).toEqual(['at://did:plc:x/site.doc/1']);
  });

  it('reads name and content in either order, single or double quotes', () => {
    const html = `
      <meta content='at://did:plc:a/site.doc/1' name='at:canonical'>
      <meta name="at:canonical" content="at://did:plc:b/site.doc/2">
    `;
    expect(extractCanonicalUris(html)).toEqual([
      'at://did:plc:a/site.doc/1',
      'at://did:plc:b/site.doc/2',
    ]);
  });

  it('honours array semantics: every matching tag counts', () => {
    const html = `
      <meta name="at:canonical" content="at://did:plc:a/site.doc/1">
      <meta name="at:canonical" content="at://did:plc:b/site.doc/2">
    `;
    expect(extractCanonicalUris(html)).toEqual([
      'at://did:plc:a/site.doc/1',
      'at://did:plc:b/site.doc/2',
    ]);
  });

  it('ignores other at: tags and unrelated meta tags', () => {
    const html = `
      <meta name="at:alternate" content="at://did:plc:x/site.doc/1">
      <meta name="description" content="hello">
      <meta name="at:canonical" content="at://did:plc:y/site.doc/2">
    `;
    expect(extractCanonicalUris(html)).toEqual(['at://did:plc:y/site.doc/2']);
  });

  it('finds nothing when there is no canonical tag', () => {
    expect(extractCanonicalUris('<html><head><title>x</title></head></html>')).toEqual([]);
  });
});

describe('fetchCanonicalUris', () => {
  const html = (uri: string) =>
    `<!doctype html><html><head><meta name="at:canonical" content="${uri}"></head></html>`;

  type Page = { status?: number; headers?: Record<string, string>; body?: string };
  type Addresses = Record<string, { address: string; family: number }[]>;

  /** Stands in for node's http client. It consults the `lookup` the module
      passed in, exactly as a real socket would, so the guard is exercised by
      every one of these tests rather than stepped around. */
  function fakeClient(serve: (url: URL) => Page) {
    return {
      request: (
        url: URL,
        options: { lookup: LookupFunction },
        onResponse: (
          res: EventEmitter & { statusCode: number; headers: Record<string, unknown> },
        ) => void,
      ) => {
        const req = Object.assign(new EventEmitter(), {
          destroy() {},
          end() {
            options.lookup(url.hostname, {}, (err: unknown) => {
              if (err) return void req.emit('error', err);
              const page = serve(url);
              const res = Object.assign(new EventEmitter(), {
                statusCode: page.status ?? 200,
                headers: page.headers ?? { 'content-type': 'text/html' },
                destroy() {},
              });
              onResponse(res);
              queueMicrotask(() => {
                if (page.body) res.emit('data', Buffer.from(page.body));
                res.emit('end');
              });
            });
          },
        });
        return req;
      },
    };
  }

  async function withDns(
    addresses: Addresses,
    serve: (url: URL) => Page,
    connectAddresses: Addresses = addresses,
  ) {
    vi.resetModules();
    vi.doMock('node:dns/promises', () => ({
      lookup: async (hostname: string) => {
        const found = addresses[hostname];
        if (!found) throw new Error('not found');
        return found;
      },
    }));
    // The second resolution: what the socket would get, which a rebind can
    // make differ from what the pre-flight check above saw.
    vi.doMock('node:dns', () => ({
      lookup: (
        hostname: string,
        _options: unknown,
        cb: (err: Error | null, addresses?: unknown) => void,
      ) => {
        const found = connectAddresses[hostname];
        if (!found) return cb(new Error('not found'));
        cb(null, found);
      },
    }));
    const client = fakeClient(serve);
    vi.doMock('node:http', () => client);
    vi.doMock('node:https', () => client);
    return import('./canonical.ts');
  }

  it('returns the canonical uri for a public page (happy path)', async () => {
    const { fetchCanonicalUris } = await withDns(
      { 'example.com': [{ address: '93.184.216.34', family: 4 }] },
      () => ({ body: html('at://did:plc:x/site.doc/1') }),
    );
    expect(await fetchCanonicalUris('https://example.com/post/1')).toEqual([
      'at://did:plc:x/site.doc/1',
    ]);
  });

  it('offers every declared canonical (array semantics)', async () => {
    const { fetchCanonicalUris } = await withDns(
      { 'example.com': [{ address: '93.184.216.34', family: 4 }] },
      () => ({
        body:
          '<meta name="at:canonical" content="at://did:plc:a/site.doc/1">' +
          '<meta name="at:canonical" content="at://did:plc:b/site.doc/2">',
      }),
    );
    expect(await fetchCanonicalUris('https://example.com/post/1')).toEqual([
      'at://did:plc:a/site.doc/1',
      'at://did:plc:b/site.doc/2',
    ]);
  });

  it('returns an empty list when the page declares no canonical', async () => {
    const { fetchCanonicalUris } = await withDns(
      { 'example.com': [{ address: '93.184.216.34', family: 4 }] },
      () => ({ body: '<html><head></head></html>' }),
    );
    expect(await fetchCanonicalUris('https://example.com/post/1')).toEqual([]);
  });

  it('drops a canonical value that fails subject validation (a profile record)', async () => {
    const { fetchCanonicalUris } = await withDns(
      { 'example.com': [{ address: '93.184.216.34', family: 4 }] },
      () => ({ body: html('at://did:plc:x/app.bsky.actor.profile/self') }),
    );
    expect(await fetchCanonicalUris('https://example.com/post/1')).toEqual([]);
  });

  it('rejects a non-http(s) scheme', async () => {
    const { fetchCanonicalUris } = await withDns({}, () => {
      throw new Error('fetch must not be called');
    });
    expect(await fetchCanonicalUris('file:///etc/passwd')).toEqual([]);
  });

  it('rejects a loopback address', async () => {
    const { fetchCanonicalUris } = await withDns(
      { 'localhost.example': [{ address: '127.0.0.1', family: 4 }] },
      () => {
        throw new Error('fetch must not be called');
      },
    );
    expect(await fetchCanonicalUris('http://localhost.example/')).toEqual([]);
  });

  it('rejects an RFC1918 private address', async () => {
    const { fetchCanonicalUris } = await withDns(
      { 'internal.example': [{ address: '10.0.0.5', family: 4 }] },
      () => {
        throw new Error('fetch must not be called');
      },
    );
    expect(await fetchCanonicalUris('http://internal.example/')).toEqual([]);
  });

  it('rejects the cloud metadata link-local address', async () => {
    const { fetchCanonicalUris } = await withDns(
      { 'metadata.example': [{ address: '169.254.169.254', family: 4 }] },
      () => {
        throw new Error('fetch must not be called');
      },
    );
    expect(await fetchCanonicalUris('http://metadata.example/')).toEqual([]);
  });

  it('rejects an IPv6 loopback address', async () => {
    const { fetchCanonicalUris } = await withDns(
      { 'v6.example': [{ address: '::1', family: 6 }] },
      () => {
        throw new Error('fetch must not be called');
      },
    );
    expect(await fetchCanonicalUris('http://v6.example/')).toEqual([]);
  });

  it('rejects an IPv6 unique-local address', async () => {
    const { fetchCanonicalUris } = await withDns(
      { 'v6.example': [{ address: 'fc00::1', family: 6 }] },
      () => {
        throw new Error('fetch must not be called');
      },
    );
    expect(await fetchCanonicalUris('http://v6.example/')).toEqual([]);
  });

  it('rejects an IPv4-mapped IPv6 form of a blocked address', async () => {
    const { fetchCanonicalUris } = await withDns(
      { 'mapped.example': [{ address: '::ffff:127.0.0.1', family: 6 }] },
      () => {
        throw new Error('fetch must not be called');
      },
    );
    expect(await fetchCanonicalUris('http://mapped.example/')).toEqual([]);
  });

  it('rejects a multicast address', async () => {
    const { fetchCanonicalUris } = await withDns(
      { 'multicast.example': [{ address: '224.0.0.1', family: 4 }] },
      () => {
        throw new Error('fetch must not be called');
      },
    );
    expect(await fetchCanonicalUris('http://multicast.example/')).toEqual([]);
  });

  it('rejects the unspecified address', async () => {
    const { fetchCanonicalUris } = await withDns(
      { 'unspecified.example': [{ address: '0.0.0.0', family: 4 }] },
      () => {
        throw new Error('fetch must not be called');
      },
    );
    expect(await fetchCanonicalUris('http://unspecified.example/')).toEqual([]);
  });

  it('rejects a bare loopback IP given directly as the URL host', async () => {
    const { fetchCanonicalUris } = await withDns(
      { '127.0.0.1': [{ address: '127.0.0.1', family: 4 }] },
      () => {
        throw new Error('fetch must not be called');
      },
    );
    expect(await fetchCanonicalUris('http://127.0.0.1/')).toEqual([]);
  });

  it('rejects a host that resolves to one public and one private address', async () => {
    const { fetchCanonicalUris } = await withDns(
      {
        'mixed.example': [
          { address: '93.184.216.34', family: 4 },
          { address: '10.0.0.1', family: 4 },
        ],
      },
      () => {
        throw new Error('fetch must not be called');
      },
    );
    expect(await fetchCanonicalUris('http://mixed.example/')).toEqual([]);
  });

  it('follows a redirect to a public host but rejects one that lands internally', async () => {
    const { fetchCanonicalUris } = await withDns(
      {
        'redirector.example': [{ address: '93.184.216.34', family: 4 }],
        'internal.example': [{ address: '10.0.0.5', family: 4 }],
      },
      (url) => {
        if (url.hostname === 'redirector.example') {
          return { status: 302, headers: { location: 'http://internal.example/' } };
        }
        throw new Error('the internal hop must never be fetched');
      },
    );
    expect(await fetchCanonicalUris('http://redirector.example/')).toEqual([]);
  });

  it('follows a redirect to another public host and returns its canonical', async () => {
    const { fetchCanonicalUris } = await withDns(
      {
        'redirector.example': [{ address: '93.184.216.34', family: 4 }],
        'destination.example': [{ address: '93.184.216.35', family: 4 }],
      },
      (url) =>
        url.hostname === 'redirector.example'
          ? { status: 302, headers: { location: 'http://destination.example/' } }
          : { body: html('at://did:plc:x/site.doc/1') },
    );
    expect(await fetchCanonicalUris('http://redirector.example/')).toEqual([
      'at://did:plc:x/site.doc/1',
    ]);
  });

  it('rejects a non-HTML response', async () => {
    const { fetchCanonicalUris } = await withDns(
      { 'api.example': [{ address: '93.184.216.34', family: 4 }] },
      () => ({
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ 'at:canonical': 'at://did:plc:x/site.doc/1' }),
      }),
    );
    expect(await fetchCanonicalUris('https://api.example/data')).toEqual([]);
  });

  it('refuses a host that answers public to the check and loopback to the socket', async () => {
    const { fetchCanonicalUris } = await withDns(
      { 'rebind.example': [{ address: '93.184.216.34', family: 4 }] },
      () => ({ body: html('at://did:plc:x/site.doc/1') }),
      { 'rebind.example': [{ address: '127.0.0.1', family: 4 }] },
    );
    expect(await fetchCanonicalUris('http://rebind.example/')).toEqual([]);
  });

  it('returns an empty list when the url does not parse', async () => {
    const { fetchCanonicalUris } = await withDns({}, () => {
      throw new Error('fetch must not be called');
    });
    expect(await fetchCanonicalUris('not a url')).toEqual([]);
  });
});
