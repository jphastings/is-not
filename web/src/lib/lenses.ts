import wasmUrl from '@is-not/lenses/isnot_lenses.wasm?url';
import { fetchRecord, loadLenses, type Resolution } from '@is-not/lenses';

let lenses: Promise<Awaited<ReturnType<typeof loadLenses>>> | undefined;

export const RECORD_URI = /^at:\/\/[^/\s]+\/[^/\s]+\/[^/\s]+$/;

/** Fetches the record from its PDS and runs the lenses over it, in the browser. */
export async function resolveSubject(uri: string): Promise<Resolution> {
  lenses ??= loadLenses(new URL(wasmUrl, location.origin));
  const [engine, { cid, record }] = await Promise.all([lenses, fetchRecord(uri)]);
  return engine.resolveSubject({ uri, cid, record });
}
