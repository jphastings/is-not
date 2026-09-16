import { read } from '$app/server';
import fontUrl from './fonts/Baloo2-Bold.ttf?url';
import resvgWasmUrl from '@resvg/resvg-wasm/index_bg.wasm?url';

export type Assets = { font: Uint8Array; resvgWasm: Uint8Array };

/**
 * `read()` (not `new URL(import.meta.url)`) is the supported way to reach a
 * server-only asset from the adapter-node build: see the lenses wasm entry
 * under "Things that cost time" in CLAUDE.md for what goes wrong otherwise.
 * `read()` doesn't run under vitest, so `og.test.ts` mocks this module and
 * reads the same files with `node:fs` instead.
 */
export async function loadAssets(): Promise<Assets> {
  const [font, resvgWasm] = await Promise.all([
    read(fontUrl).arrayBuffer(),
    read(resvgWasmUrl).arrayBuffer(),
  ]);
  return { font: new Uint8Array(font), resvgWasm: new Uint8Array(resvgWasm) };
}
