import { readFileSync } from 'node:fs';
import { parse as parseFont } from 'opentype.js';
import { describe, expect, it, vi } from 'vite-plus/test';
import { reviewSentence } from '@is-not/sentence';

const FONT_PATH = new URL('./fonts/Baloo2-Bold.ttf', import.meta.url);
const RESVG_WASM_PATH = import.meta.resolve('@resvg/resvg-wasm/index_bg.wasm');

vi.mock('./ogAssets', () => ({
  loadAssets: async () => ({
    font: new Uint8Array(readFileSync(FONT_PATH)),
    resvgWasm: new Uint8Array(readFileSync(new URL(RESVG_WASM_PATH))),
  }),
}));

const { phrasePng, defaultPhrase, layout, pathData, WIDTH, HEIGHT } = await import('./og.ts');

const font = parseFont(readFileSync(FONT_PATH).buffer);

function longPhrase() {
  return reviewSentence({
    subject: {
      uri: '',
      title: 'a genuinely quite remarkably overengineered home coffee espresso machine',
    },
    tags: [
      { direction: 2, adjective: 'astonishingly well built' },
      { direction: 2, adjective: 'a little noisy' },
      { direction: 1, adjective: 'expensive but worth it' },
    ],
  });
}

describe('phrasePng', () => {
  it('renders a 1200x630 PNG', async () => {
    const png = await phrasePng(defaultPhrase());

    // PNG signature, then the IHDR chunk: length(4) type(4) width(4) height(4).
    expect(Array.from(png.subarray(0, 8))).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    expect(view.getUint32(16)).toBe(WIDTH);
    expect(view.getUint32(20)).toBe(HEIGHT);
  });
});

describe('layout', () => {
  it('shrinks the font for a longer phrase', () => {
    const short = layout(defaultPhrase(), font);
    const long = layout(longPhrase(), font);
    expect(long.fontSize).toBeLessThan(short.fontSize);
  });

  it('keeps every line, and the tagline, inside the text box below the logo', () => {
    const laid = layout(longPhrase(), font, { tagline: 'Simple, nuanced micro-reviewing' });
    for (const line of laid.lines) {
      expect(line.top).toBeGreaterThanOrEqual(laid.box.top);
      expect(line.top + line.height).toBeLessThanOrEqual(laid.box.bottom);
    }
    expect(laid.tagline).toBeDefined();
    expect(laid.tagline!.top).toBeGreaterThanOrEqual(laid.box.top);
    expect(laid.tagline!.top + laid.tagline!.height).toBeLessThanOrEqual(laid.box.bottom);
  });
});

describe('pathData', () => {
  // opentype.js's own toPathData emits NaN for this font at these sizes.
  it('never emits NaN', () => {
    for (const size of [20, 24, 25]) {
      expect(pathData(font, 'Simple, nuanced micro-reviewing is/not handy', size)).not.toContain(
        'NaN',
      );
    }
  });
});
