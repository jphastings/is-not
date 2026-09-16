import wasmUrl from '@is-not/lenses/isnot_lenses.wasm?url';
import { fetchRecord, loadLenses, type Resolution } from '@is-not/lenses';

let lenses: Promise<Awaited<ReturnType<typeof loadLenses>>> | undefined;

// A PLC or PDS that never answers would otherwise leave the field "resolving"
// for good. The wasm download is deliberately not timed: it is ~1MB, and a
// slow link needs the time.
const FETCH_TIMEOUT_MS = 8000;
const timedFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });

/** Fetches the record from its PDS and runs the lenses over it, in the browser. */
export async function resolveSubject(uri: string): Promise<Resolution> {
  lenses ??= loadLenses(new URL(wasmUrl, location.origin));
  const [engine, { cid, record }] = await Promise.all([lenses, fetchRecord(uri, timedFetch)]);
  return engine.resolveSubject({ uri, cid, record });
}
