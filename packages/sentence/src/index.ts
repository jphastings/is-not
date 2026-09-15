import { en } from './locales/en.ts';

export type Direction = -2 | -1 | 0 | 1 | 2;
export type Tag = { direction: Direction; adjective: string };
export type Review = {
  subject: { uri: string; title: string };
  tags: Tag[];
  locale?: string;
};
export type Who = { handle: string; did: string; self?: boolean };
export type SentenceOptions = {
  locale?: string;
  localeMode?: 'fallback' | 'override';
  who?: Who;
};
export type Part =
  | { kind: 'text'; text: string }
  | { kind: 'who'; text: string; did: string }
  | { kind: 'subject'; text: string; uri: string }
  | { kind: 'direction'; text: string; direction: Direction }
  | { kind: 'adjective'; text: string; adjective: string; direction: Direction };
export type Messages = {
  thinks: string;
  self: string;
  selfThinks: string;
  directions: Record<'2' | '1' | '0' | '-1' | '-2', string>;
};

const locales: Record<string, Messages> = { en };
// Neutral (0) sits between positive and negative, matching a strength scale.
const order: Direction[] = [2, 1, 0, -1, -2];

export function resolveLocale(
  reviewLocale: string | undefined,
  options: SentenceOptions = {},
): string {
  const candidates =
    options.localeMode === 'override' ? [options.locale] : [reviewLocale, options.locale];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const tag = candidate.toLowerCase();
    if (locales[tag]) return tag;
    const language = tag.split('-')[0];
    if (locales[language]) return language;
  }
  return 'en';
}

/** Adds or replaces the messages for a locale (a BCP 47 tag, matched case-insensitively). */
export function registerLocale(tag: string, messages: Messages): void {
  locales[tag.toLowerCase()] = messages;
}

export function reviewSentence(review: Review, options: SentenceOptions = {}): Part[] {
  const locale = resolveLocale(review.locale, options);
  const m = locales[locale];
  const list = new Intl.ListFormat(locale, { type: 'conjunction' });
  const parts: Part[] = [];

  if (options.who) {
    const { handle, did, self } = options.who;
    parts.push(
      { kind: 'who', text: self ? m.self : `@${handle}`, did },
      { kind: 'text', text: ` ${self ? m.selfThinks : m.thinks} ` },
    );
  }
  parts.push(
    { kind: 'subject', text: review.subject.title, uri: review.subject.uri },
    { kind: 'text', text: ' ' },
  );

  const groups = order
    .map((direction) => ({ direction, tags: review.tags.filter((t) => t.direction === direction) }))
    .filter((g) => g.tags.length > 0)
    .map(({ direction, tags }): Part[] => [
      {
        kind: 'direction',
        text: m.directions[String(direction) as keyof Messages['directions']],
        direction,
      },
      { kind: 'text', text: ' ' },
      ...joinParts(
        list,
        tags.map(
          (t) =>
            ({ kind: 'adjective', text: t.adjective, adjective: t.adjective, direction }) as Part,
        ),
      ),
    ]);
  parts.push(...joinParts(list, groups));
  return parts;
}

// Uses the locale's list formatting ("a, b and c") while keeping every item a typed part.
function joinParts(list: Intl.ListFormat, items: (Part | Part[])[]): Part[] {
  const out: Part[] = [];
  let i = 0;
  for (const piece of list.formatToParts(items.map((_, n) => String(n)))) {
    if (piece.type === 'element') {
      const item = items[i++];
      out.push(...(Array.isArray(item) ? item : [item]));
    } else {
      out.push({ kind: 'text', text: piece.value });
    }
  }
  return out;
}

export function sentenceText(parts: Part[]): string {
  return parts.map((p) => p.text).join('');
}

export type Wrap = Partial<Record<Part['kind'], (html: string, part: Part) => string>>;

export function sentenceHTML(parts: Part[], wrap: Wrap = {}): string {
  return parts
    .map((part) => {
      const html = escape(part.text);
      const fn = wrap[part.kind];
      return fn ? fn(html, part) : html;
    })
    .join('');
}

function escape(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}
