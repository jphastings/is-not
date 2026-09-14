import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildTag, fetchRecord, loadLenses } from './index.ts';

const testdata = new URL('../testdata/', import.meta.url).pathname;

function fixtures(dir: string): [string, { input: unknown; expected: unknown }][] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return fixtures(path);
    return name.endsWith('.json') ? [[path, JSON.parse(readFileSync(path, 'utf8'))]] : [];
  });
}

const lenses = await loadLenses(new URL('../dist/isnot_lenses.wasm', import.meta.url));

describe('resolveSubject', () => {
  for (const [name, { input, expected }] of fixtures(testdata)) {
    it(name, () => {
      expect(lenses.resolveSubject(input as never)).toEqual(expected);
    });
  }
  it('lists supported collections', () => {
    expect(lenses.supportedCollections()).toContain('social.popfeed.feed.review');
  });
});

const uri = 'at://did:plc:example/com.example.thing/3abc';
const cid = 'bafyreibzsi5ubmnp4dx744kye6ulejwmpdhhnmem2vnaocgqm2fybvzyqa';
const stubFetch = (async (url: string | URL | Request) => {
  const u = String(url);
  if (u === 'https://plc.directory/did:plc:example') {
    return Response.json({ service: [{ id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: 'https://pds.example' }] });
  }
  if (u.startsWith('https://pds.example/xrpc/com.atproto.repo.getRecord?')) {
    const q = new URL(u).searchParams;
    expect([q.get('repo'), q.get('collection'), q.get('rkey')]).toEqual(['did:plc:example', 'com.example.thing', '3abc']);
    return Response.json({ uri, cid, value: { $type: 'com.example.thing', name: 'A Thing', externalId: '42' } });
  }
  return new Response('not found', { status: 404 });
}) as typeof fetch;

describe('fetchRecord', () => {
  it('resolves the PDS and fetches the record', async () => {
    await expect(fetchRecord(uri, stubFetch)).resolves.toEqual({ cid, record: { $type: 'com.example.thing', name: 'A Thing', externalId: '42' } });
  });
  it('rejects non-record uris', async () => {
    await expect(fetchRecord('at://did:plc:example', stubFetch)).rejects.toThrow(/at-uri/);
  });
});

describe('buildTag', () => {
  it('produces a complete at.isnot.tag record', async () => {
    const { record, supported } = await buildTag(lenses, { uri, direction: 1, adjective: 'good' }, stubFetch);
    expect(supported).toBe(false);
    expect(record).toMatchObject({
      $type: 'at.isnot.tag',
      adjective: 'good',
      direction: 1,
      subject: { uri, cid, title: 'A Thing', type: '', identifiers: [{ key: 'externalId', value: '42' }] },
    });
    expect(record.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});
