import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vite-plus/test';
import {
  registerLocale,
  resolveLocale,
  reviewSentence,
  sentenceHTML,
  sentenceText,
  type Part,
} from './index.ts';

const wrap = {
  subject: (html: string, part: Part) =>
    `<a href="${part.kind === 'subject' ? part.uri : ''}">${html}</a>`,
  adjective: (html: string) => `<em>${html}</em>`,
};

const root = join(import.meta.dirname, '..', 'testdata');
for (const locale of readdirSync(root)) {
  describe(locale, () => {
    for (const file of readdirSync(join(root, locale))) {
      it(file, () => {
        const fixture = JSON.parse(readFileSync(join(root, locale, file), 'utf8'));
        const parts = reviewSentence(fixture.review, fixture.options);
        expect(sentenceText(parts)).toBe(fixture.text);
        if (fixture.html) expect(sentenceHTML(parts, wrap)).toBe(fixture.html);
      });
    }
  });
}

describe('resolveLocale', () => {
  it('prefers the review locale unless overridden', () => {
    registerLocale('fr', {
      thinks: 'pense que',
      self: 'Vous',
      selfThinks: 'pensez que',
      directions: { 2: 'est vraiment', 1: 'est', '-1': "n'est pas", '-2': "n'est vraiment pas" },
    });
    expect(resolveLocale('en', { locale: 'fr' })).toBe('en');
    expect(resolveLocale('en', { locale: 'fr', localeMode: 'override' })).toBe('fr');
    expect(resolveLocale('en', { locale: 'xx', localeMode: 'override' })).toBe('en');
  });
  it('falls back through language subtag to en', () => {
    expect(resolveLocale('en-NZ')).toBe('en');
    expect(resolveLocale('xx-YY', { locale: 'zz' })).toBe('en');
    expect(resolveLocale(undefined)).toBe('en');
  });
});

describe('parts', () => {
  it('types every piece of the sentence', () => {
    const parts = reviewSentence(
      { subject: { uri: 'at://x/y/1', title: 'It' }, tags: [{ direction: -1, adjective: 'dull' }] },
      { who: { handle: 'a.b', did: 'did:plc:a' } },
    );
    expect(parts.map((p) => p.kind)).toEqual([
      'who',
      'text',
      'subject',
      'text',
      'direction',
      'text',
      'adjective',
    ]);
  });
});
