export type Identifier = { key: string; value: string };
export type Subject = {
  uri: string;
  cid: string;
  title: string;
  type: string;
  identifiers?: Identifier[];
};
export type Resolution = { supported: boolean; subject: Subject } | { error: string };
export type Direction = -2 | -1 | 0 | 1 | 2;
export type Tag = { direction: Direction; adjective: string };
export type ReviewRecord = {
  $type: 'at.isnot.review';
  subject: Subject;
  tags: Tag[];
  createdAt: string;
  updatedAt: string;
  locale?: string;
};

type Exports = {
  memory: WebAssembly.Memory;
  alloc(len: number): number;
  dealloc(ptr: number, len: number): void;
  resolve_subject(ptr: number, len: number): number;
  supported_collections(): number;
};

export class Lenses {
  #exports: Exports;

  constructor(instance: WebAssembly.Instance) {
    this.#exports = instance.exports as unknown as Exports;
  }

  resolveSubject(input: { uri: string; cid: string; record: unknown }): Resolution {
    const bytes = new TextEncoder().encode(JSON.stringify(input));
    const ptr = this.#exports.alloc(bytes.length);
    new Uint8Array(this.#exports.memory.buffer, ptr, bytes.length).set(bytes);
    const result = this.#exports.resolve_subject(ptr, bytes.length);
    this.#exports.dealloc(ptr, bytes.length);
    return JSON.parse(this.#take(result));
  }

  supportedCollections(): string[] {
    return JSON.parse(this.#take(this.#exports.supported_collections()));
  }

  #take(result: number): string {
    const len = new DataView(this.#exports.memory.buffer).getUint32(result, true);
    const text = new TextDecoder().decode(
      new Uint8Array(this.#exports.memory.buffer, result + 4, len),
    );
    this.#exports.dealloc(result, 4 + len);
    return text;
  }
}

export type WasmSource = BufferSource | WebAssembly.Module | Response | Promise<Response> | URL;

// Must resolve statically (no ternary) so bundlers recognise it and copy the asset next to
// dist/index.js. Running from src (e.g. the test suite) passes an explicit source instead.
const WASM_URL = new URL('./isnot_lenses.wasm', import.meta.url);

/** Instantiate the lenses. With no argument, loads the wasm shipped in this package. */
export async function loadLenses(source?: WasmSource): Promise<Lenses> {
  const src = source ?? WASM_URL;
  const isNode = typeof process !== 'undefined' && !!process.versions?.node;
  let bytes: BufferSource | WebAssembly.Module;
  if (src instanceof URL && src.protocol === 'file:' && isNode) {
    const [{ readFile }, { fileURLToPath }] = await Promise.all([
      import('node:fs/promises'),
      import('node:url'),
    ]);
    bytes = await readFile(fileURLToPath(src));
  } else if (src instanceof URL || src instanceof Response || src instanceof Promise) {
    bytes = await (src instanceof URL ? fetch(src) : src).then((r) => r.arrayBuffer());
  } else {
    bytes = src;
  }
  const { instance } =
    bytes instanceof WebAssembly.Module
      ? { instance: await WebAssembly.instantiate(bytes, {}) }
      : await WebAssembly.instantiate(bytes, {});
  return new Lenses(instance);
}

const recordUri = /^at:\/\/([^/]+)\/([^/]+)\/([^/]+)$/;

/** Fetch a record by at-uri: resolves the DID document, finds the PDS, calls getRecord. */
export async function fetchRecord(
  uri: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ cid: string; record: unknown }> {
  const match = recordUri.exec(uri);
  if (!match) throw new Error(`not a record at-uri: ${uri}`);
  const [, did, collection, rkey] = match;
  const url = new URL('/xrpc/com.atproto.repo.getRecord', await pdsFor(did, fetchImpl));
  url.searchParams.set('repo', did);
  url.searchParams.set('collection', collection);
  url.searchParams.set('rkey', rkey);
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`getRecord failed for ${uri}: ${res.status}`);
  const body = (await res.json()) as { cid?: unknown; value: unknown };
  if (typeof body.cid !== 'string') throw new Error(`getRecord returned no cid for ${uri}`);
  return { cid: body.cid, record: body.value };
}

// ponytail: process-lifetime cache, no TTL — a PDS migration won't be picked up without a restart.
const pdsCache = new Map<string, Promise<string>>();

function pdsFor(did: string, fetchImpl: typeof fetch): Promise<string> {
  let cached = pdsCache.get(did);
  if (!cached) {
    cached = resolvePds(did, fetchImpl).catch((err) => {
      pdsCache.delete(did);
      throw err;
    });
    pdsCache.set(did, cached);
  }
  return cached;
}

async function resolvePds(did: string, fetchImpl: typeof fetch): Promise<string> {
  let docUrl: string;
  if (did.startsWith('did:plc:')) docUrl = `https://plc.directory/${did}`;
  else if (did.startsWith('did:web:'))
    docUrl = `https://${decodeURIComponent(did.slice('did:web:'.length))}/.well-known/did.json`;
  else throw new Error(`unsupported DID method: ${did}`);
  const res = await fetchImpl(docUrl);
  if (!res.ok) throw new Error(`DID resolution failed for ${did}: ${res.status}`);
  const doc = (await res.json()) as { service?: { id: string; serviceEndpoint: string }[] };
  const pds = doc.service?.find((s) => s.id === '#atproto_pds');
  if (!pds) throw new Error(`no PDS in DID document for ${did}`);
  return pds.serviceEndpoint;
}

/** Fetch the subject record and assemble a complete at.isnot.review record. */
export async function buildReview(
  lenses: Lenses,
  input: { uri: string; tags: Tag[]; locale?: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ record: ReviewRecord; supported: boolean }> {
  const { cid, record } = await fetchRecord(input.uri, fetchImpl);
  const resolution = lenses.resolveSubject({ uri: input.uri, cid, record });
  if ('error' in resolution) throw new Error(resolution.error);
  const now = new Date().toISOString();
  return {
    supported: resolution.supported,
    record: {
      $type: 'at.isnot.review',
      subject: resolution.subject,
      tags: input.tags,
      createdAt: now,
      updatedAt: now,
      ...(input.locale ? { locale: input.locale } : {}),
    },
  };
}
