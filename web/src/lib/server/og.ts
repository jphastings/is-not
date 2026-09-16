import type { Font } from 'opentype.js';
import { Resvg, initWasm } from '@resvg/resvg-wasm';
import { reviewSentence, type Part } from '@is-not/sentence';
import faviconRaw from '$lib/assets/favicon.svg?raw';
import { loadAssets } from './ogAssets';

export const WIDTH = 1200;
export const HEIGHT = 630;

const PADDING = 48;
const LOGO_SIZE = 96;
const LOGO_GAP = 32;
const LINE_HEIGHT = 1.4;
const MAX_FONT_SIZE = 88;
const MIN_FONT_SIZE = 28;
const FONT_STEP = 2;
const TAGLINE_FONT_SIZE = 24;
const TAGLINE_GAP = 24;
const UNDERLINE_THICKNESS = 0.07;
const UNDERLINE_OFFSET = 0.15;
const SKEW_DEG = -10;

// Hex copies of web/src/app.css's oklch tokens: resvg rasterises the SVG we
// build here and can't parse oklch(). Recompute with the CSS Color 4 OKLab
// matrices (not by eye) if those tokens change.
const COLORS = {
  light: {
    paper: '#f9f5e6',
    ink: '#131e11',
    inkSoft: '#4d5a4a',
    moss: '#3b793f',
    mossDeep: '#17501d',
    mossHandle: '#265e2b',
  },
  dark: {
    paper: '#14120a',
    ink: '#e7e5da',
    inkSoft: '#a29f91',
    moss: '#67bb6b',
    mossDeep: '#8bd28d',
    mossHandle: '#9be39d',
  },
};

export type Theme = 'light' | 'dark';
export type PhraseOptions = { theme?: Theme; tagline?: string };

const TEXT_BOX = {
  x: PADDING,
  y: PADDING + LOGO_SIZE + LOGO_GAP,
  width: WIDTH - PADDING * 2,
  bottom: HEIGHT - (PADDING + LOGO_SIZE + LOGO_GAP),
};

/** The card shown wherever a page has nothing more specific to say. */
export function defaultPhrase(): Part[] {
  return reviewSentence({
    subject: { uri: '', title: 'is/not' },
    tags: [{ direction: 1, adjective: 'handy' }],
  });
}

function pathD(svg: string, className: string): string {
  const match = new RegExp(`<path class="${className}" d="([^"]+)"`).exec(svg);
  if (!match) throw new Error(`favicon.svg: no path.${className} found`);
  return match[1];
}

const GROUND_PATH = pathD(faviconRaw, 'ground');
// favicon.svg names these classes for the mode they're hidden in, not the one
// they're shown in: `.dark` is what a light-mode reader sees (the default,
// unmatched state) and `.light` only appears once `prefers-color-scheme: dark`
// flips their `display` — see the media query inside favicon.svg itself.
const MARK_PATH: Record<Theme, string> = {
  light: pathD(faviconRaw, 'dark'),
  dark: pathD(faviconRaw, 'light'),
};

type Run = { text: string; kind: Part['kind']; part: number };
type Word = Run[];

function wordsFromParts(parts: Part[]): Word[] {
  const words: Word[] = [];
  let current: Word = [];
  parts.forEach((part, index) => {
    for (const piece of part.text.split(/(\s+)/)) {
      if (piece === '') continue;
      if (/^\s+$/.test(piece)) {
        if (current.length) words.push(current);
        current = [];
      } else {
        current.push({ text: piece, kind: part.kind, part: index });
      }
    }
  });
  if (current.length) words.push(current);
  return words;
}

function wordWidth(font: Font, word: Word, fontSize: number): number {
  return word.reduce((sum, run) => sum + font.getAdvanceWidth(run.text, fontSize), 0);
}

function greedyWrap(
  words: Word[],
  widths: number[],
  spaceWidth: number,
  maxWidth: number,
): Word[][] {
  const lines: Word[][] = [];
  let line: Word[] = [];
  let lineWidth = 0;
  words.forEach((word, i) => {
    const withSpace = line.length ? lineWidth + spaceWidth + widths[i] : widths[i];
    if (line.length && withSpace > maxWidth) {
      lines.push(line);
      line = [word];
      lineWidth = widths[i];
    } else {
      line.push(word);
      lineWidth = withSpace;
    }
  });
  if (line.length) lines.push(line);
  return lines;
}

// Greedy-wraps to the box width, then binary-searches for the narrowest width
// that still holds that same number of lines — the `text-wrap: balance` the
// homepage sentence gets from CSS, done by hand since resvg only takes paths.
function balancedWrap(
  words: Word[],
  widths: number[],
  spaceWidth: number,
  boxWidth: number,
): Word[][] {
  const full = greedyWrap(words, widths, spaceWidth, boxWidth);
  if (full.length <= 1) return full;
  const targetLines = full.length;
  let lo = Math.max(...widths);
  let hi = boxWidth;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    if (greedyWrap(words, widths, spaceWidth, mid).length <= targetLines) hi = mid;
    else lo = mid;
  }
  return greedyWrap(words, widths, spaceWidth, hi);
}

function fitPhrase(
  font: Font,
  words: Word[],
  availableHeight: number,
): { fontSize: number; lines: Word[][] } {
  let size = MAX_FONT_SIZE;
  for (; size > MIN_FONT_SIZE; size -= FONT_STEP) {
    const widths = words.map((w) => wordWidth(font, w, size));
    const spaceWidth = font.getAdvanceWidth(' ', size);
    const lines = balancedWrap(words, widths, spaceWidth, TEXT_BOX.width);
    const fits =
      lines.length * size * LINE_HEIGHT <= availableHeight && Math.max(...widths) <= TEXT_BOX.width;
    if (fits) return { fontSize: size, lines };
  }
  const widths = words.map((w) => wordWidth(font, w, size));
  const spaceWidth = font.getAdvanceWidth(' ', size);
  return { fontSize: size, lines: balancedWrap(words, widths, spaceWidth, TEXT_BOX.width) };
}

export type LaidOutRun = { x: number; text: string; kind: Part['kind']; part: number };
export type LaidOutLine = {
  top: number;
  height: number;
  baseline: number;
  width: number;
  runs: LaidOutRun[];
};
export type LaidOutTagline = {
  top: number;
  height: number;
  baseline: number;
  width: number;
  text: string;
};
export type Layout = {
  fontSize: number;
  lines: LaidOutLine[];
  tagline?: LaidOutTagline;
  box: { top: number; bottom: number; left: number; right: number };
};

function verticalMetrics(font: Font, fontSize: number) {
  const scale = fontSize / font.unitsPerEm;
  const ascent = font.ascender * scale;
  const descent = -font.descender * scale;
  return { ascent, descent, textHeight: ascent + descent };
}

/**
 * Lays a review sentence out inside the card's text box (below the logo,
 * mirrored above the bottom edge), picking the largest font size — stepping
 * down from MAX_FONT_SIZE — whose wrapped, balanced lines (plus the tagline,
 * if any) fit the available height. Pure and font-supplied, so it's testable
 * without resvg or `$app/server`.
 */
export function layout(parts: Part[], font: Font, options: { tagline?: string } = {}): Layout {
  const words = wordsFromParts(parts);
  const taglineMetrics = options.tagline ? verticalMetrics(font, TAGLINE_FONT_SIZE) : null;
  const taglineHeight = TAGLINE_FONT_SIZE * LINE_HEIGHT;
  const taglineReserved = options.tagline ? taglineHeight + TAGLINE_GAP : 0;

  const boxHeight = TEXT_BOX.bottom - TEXT_BOX.y;
  const { fontSize, lines: wordLines } = fitPhrase(font, words, boxHeight - taglineReserved);

  const { ascent, textHeight } = verticalMetrics(font, fontSize);
  const lineHeightPx = fontSize * LINE_HEIGHT;
  const spaceWidth = font.getAdvanceWidth(' ', fontSize);
  const phraseHeight = wordLines.length * lineHeightPx;
  const blockHeight = phraseHeight + (options.tagline ? taglineReserved : 0);
  const blockTop = TEXT_BOX.y + (boxHeight - blockHeight) / 2;

  const lines: LaidOutLine[] = wordLines.map((lineWords, i) => {
    const lineWidth = lineWords.reduce(
      (sum, word, wi) => sum + wordWidth(font, word, fontSize) + (wi ? spaceWidth : 0),
      0,
    );
    const top = blockTop + i * lineHeightPx;
    const baseline = top + (lineHeightPx - textHeight) / 2 + ascent;
    let x = TEXT_BOX.x + (TEXT_BOX.width - lineWidth) / 2;
    const runs: LaidOutRun[] = [];
    lineWords.forEach((word, wi) => {
      if (wi > 0) x += spaceWidth;
      for (const run of word) {
        runs.push({ x, text: run.text, kind: run.kind, part: run.part });
        x += font.getAdvanceWidth(run.text, fontSize);
      }
    });
    return { top, height: lineHeightPx, baseline, width: lineWidth, runs };
  });

  let tagline: LaidOutTagline | undefined;
  if (options.tagline && taglineMetrics) {
    const top = blockTop + phraseHeight + TAGLINE_GAP;
    const baseline = top + (taglineHeight - taglineMetrics.textHeight) / 2 + taglineMetrics.ascent;
    const width = font.getAdvanceWidth(options.tagline, TAGLINE_FONT_SIZE);
    tagline = { top, height: taglineHeight, baseline, width, text: options.tagline };
  }

  return {
    fontSize,
    lines,
    tagline,
    box: {
      top: TEXT_BOX.y,
      bottom: TEXT_BOX.bottom,
      left: TEXT_BOX.x,
      right: TEXT_BOX.x + TEXT_BOX.width,
    },
  };
}

function colorFor(kind: Part['kind'], colors: (typeof COLORS)[Theme]): string {
  if (kind === 'direction') return colors.mossDeep;
  if (kind === 'who') return colors.mossHandle;
  return colors.ink; // text, subject, adjective
}

// Not `path.toPathData()`: its rounding concatenates `decimal + "e+2"`, so a
// coordinate a hair off an integer (printed as `1e-15`) becomes NaN, and resvg
// drops the rest of the path at the first invalid token.
export function pathData(font: Font, text: string, fontSize: number): string {
  return font
    .getPath(text, 0, 0, fontSize)
    .commands.map((c) => {
      if (c.type === 'Z') return 'Z';
      const points =
        c.type === 'C'
          ? [c.x1, c.y1, c.x2, c.y2, c.x, c.y]
          : c.type === 'Q'
            ? [c.x1, c.y1, c.x, c.y]
            : [c.x, c.y];
      return c.type + points.map((v) => v.toFixed(2)).join(' ');
    })
    .join('');
}

function renderRun(
  font: Font,
  run: LaidOutRun,
  baseline: number,
  fontSize: number,
  colors: (typeof COLORS)[Theme],
): string {
  const d = pathData(font, run.text, fontSize);
  const color = colorFor(run.kind, colors);
  const skew = run.kind === 'text' ? ` skewX(${SKEW_DEG})` : '';
  return `<g transform="translate(${run.x.toFixed(2)},${baseline.toFixed(2)})${skew}"><path d="${d}" fill="${color}"/></g>`;
}

// One rule per part per line, so a multi-word subject is underlined through its
// spaces as `text-decoration` does on the site.
function renderUnderlines(
  font: Font,
  line: LaidOutLine,
  fontSize: number,
  colors: (typeof COLORS)[Theme],
): string {
  const spans = new Map<number, { start: number; end: number; kind: Part['kind'] }>();
  for (const run of line.runs) {
    if (run.kind !== 'subject' && run.kind !== 'adjective') continue;
    const end = run.x + font.getAdvanceWidth(run.text, fontSize);
    const span = spans.get(run.part);
    if (span) span.end = end;
    else spans.set(run.part, { start: run.x, end, kind: run.kind });
  }
  const y = line.baseline + fontSize * UNDERLINE_OFFSET;
  const height = fontSize * UNDERLINE_THICKNESS;
  return [...spans.values()]
    .map(
      ({ start, end, kind }) =>
        `<rect x="${start.toFixed(2)}" y="${y.toFixed(2)}" width="${(end - start).toFixed(2)}" height="${height.toFixed(2)}" fill="${colorFor(kind, colors)}"/>`,
    )
    .join('');
}

function renderLogo(theme: Theme, colors: (typeof COLORS)[Theme]): string {
  // favicon.svg's viewBox is "-5 -5 110 110"; this scales its 110-unit square
  // to LOGO_SIZE and slides its (-5,-5) origin to (PADDING, PADDING).
  const scale = LOGO_SIZE / 110;
  const offset = PADDING + 5 * scale;
  return `<g transform="translate(${offset},${offset}) scale(${scale})">
    <path d="${GROUND_PATH}" fill="${colors.paper}"/>
    <path d="${MARK_PATH[theme]}" fill="${colors.moss}"/>
  </g>`;
}

function renderSvg(parts: Part[], font: Font, options: PhraseOptions): string {
  const theme = options.theme ?? 'dark';
  const colors = COLORS[theme];
  const laid = layout(parts, font, { tagline: options.tagline });

  const lines = laid.lines
    .map(
      (line) =>
        line.runs
          .map((run) => renderRun(font, run, line.baseline, laid.fontSize, colors))
          .join('') + renderUnderlines(font, line, laid.fontSize, colors),
    )
    .join('');

  let taglineSvg = '';
  if (laid.tagline) {
    const d = pathData(font, laid.tagline.text, TAGLINE_FONT_SIZE);
    const x = TEXT_BOX.x + (TEXT_BOX.width - laid.tagline.width) / 2;
    taglineSvg = `<g transform="translate(${x.toFixed(2)},${laid.tagline.baseline.toFixed(2)})"><path d="${d}" fill="${colors.inkSoft}"/></g>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    <rect width="${WIDTH}" height="${HEIGHT}" fill="${colors.paper}"/>
    ${renderLogo(theme, colors)}
    ${lines}
    ${taglineSvg}
  </svg>`;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

let assets: ReturnType<typeof loadAssets> | undefined;
function getAssets() {
  return (assets ??= loadAssets());
}

type OpentypeExports = typeof import('opentype.js');

// opentype.js ships no `exports` map, so plain Node ESM (as opposed to Vite's
// bundler, which prefers its `module` field) resolves the import to its CJS
// build, and SvelteKit's postbuild step — which loads this route directly
// under plain Node to check for prerender flags — can't always see `parse` as
// a named export of that file. A dynamic import, read through the CJS
// interop's always-present `default`, works under both; a static
// `import { parse } from 'opentype.js'` broke that postbuild step.
let parsePromise: Promise<OpentypeExports['parse']> | undefined;
function getParse(): Promise<OpentypeExports['parse']> {
  return (parsePromise ??= import('opentype.js').then((mod) => {
    const exports = mod as Partial<OpentypeExports> & { default?: OpentypeExports };
    const parse = exports.parse ?? exports.default?.parse;
    if (!parse) throw new Error('opentype.js: no parse export found');
    return parse;
  }));
}

let fontPromise: Promise<Font> | undefined;
function getFont(): Promise<Font> {
  return (fontPromise ??= Promise.all([getAssets(), getParse()]).then(([{ font }, parse]) =>
    parse(toArrayBuffer(font)),
  ));
}

let resvgReady: Promise<void> | undefined;
function ensureResvg(): Promise<void> {
  return (resvgReady ??= getAssets().then(({ resvgWasm }) => initWasm(resvgWasm)));
}

export async function phrasePng(parts: Part[], options: PhraseOptions = {}): Promise<Uint8Array> {
  const [font] = await Promise.all([getFont(), ensureResvg()]);
  const svg = renderSvg(parts, font, options);
  return new Resvg(svg).render().asPng();
}
