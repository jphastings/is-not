import type { Tag } from '@is-not/lenses';
import { describe, expect, it } from 'vite-plus/test';
import { mergeTags, validateReview } from './review';

const validSubject = {
  uri: 'at://did:plc:x/app.bsky.feed.post/1',
  cid: 'bafy1',
  title: 'a sandwich',
  type: 'post',
};

describe('validateReview', () => {
  it('normalises valid input: adjectives trimmed, locale lowercased', () => {
    const result = validateReview({
      subject: validSubject,
      tags: [{ adjective: '  Loud  ', direction: 1 }],
      locale: 'EN-GB',
    });
    expect(result).toEqual({
      ok: true,
      value: {
        subject: validSubject,
        tags: [{ adjective: 'Loud', direction: 1 }],
        locale: 'en-gb',
        prefilled: [],
      },
    });
  });

  it('fails with zero tags', () => {
    const result = validateReview({ subject: validSubject, tags: [] });
    expect(result).toEqual({ ok: false, error: 'tags' });
  });

  it('fails with 33 tags', () => {
    const tags = Array.from({ length: 33 }, (_, i) => ({ adjective: `a${i}`, direction: 1 }));
    const result = validateReview({ subject: validSubject, tags });
    expect(result).toEqual({ ok: false, error: 'tags' });
  });

  it('fails when an adjective is 17 graphemes (skin-tone emoji, not code points)', () => {
    const adjective = '👍🏽'.repeat(17);
    const result = validateReview({ subject: validSubject, tags: [{ adjective, direction: 1 }] });
    expect(result).toEqual({ ok: false, error: 'adjective' });
  });

  it('fails when an adjective is over 160 bytes despite being within 16 graphemes', () => {
    // 16 grapheme clusters, each a base letter plus many combining accents.
    const adjective = ('e' + '́'.repeat(20)).repeat(16);
    const result = validateReview({ subject: validSubject, tags: [{ adjective, direction: 1 }] });
    expect(result).toEqual({ ok: false, error: 'adjective' });
  });

  it('fails with direction 3', () => {
    const result = validateReview({
      subject: validSubject,
      tags: [{ adjective: 'loud', direction: 3 }],
    });
    expect(result).toEqual({ ok: false, error: 'direction' });
  });

  it('fails with a missing subject uri', () => {
    const subject = { cid: 'bafy1', title: 'a sandwich', type: 'post' };
    const result = validateReview({ subject, tags: [{ adjective: 'loud', direction: 1 }] });
    expect(result).toEqual({ ok: false, error: 'subject' });
  });

  it('fails with a title of 257 graphemes', () => {
    const subject = { ...validSubject, title: 'a'.repeat(257) };
    const result = validateReview({ subject, tags: [{ adjective: 'loud', direction: 1 }] });
    expect(result).toEqual({ ok: false, error: 'title' });
  });

  it("fails with an invalid locale ('not a tag')", () => {
    const result = validateReview({
      subject: validSubject,
      tags: [{ adjective: 'loud', direction: 1 }],
      locale: 'not a tag',
    });
    expect(result).toEqual({ ok: false, error: 'locale' });
  });
});

describe('mergeTags', () => {
  const stored: Tag[] = [
    { direction: 1, adjective: 'loud' },
    { direction: -1, adjective: 'long' },
  ];

  it('adds an adjective the review does not have', () => {
    expect(mergeTags(stored, [{ direction: 2, adjective: 'funny' }], [])).toEqual([
      ...stored,
      { direction: 2, adjective: 'funny' },
    ]);
  });

  it('re-aims an adjective the review already has, in place', () => {
    expect(mergeTags(stored, [{ direction: -2, adjective: 'Loud' }], [])).toEqual([
      { direction: -2, adjective: 'Loud' },
      { direction: -1, adjective: 'long' },
    ]);
  });

  it('removes only what the form was shown and no longer offers', () => {
    expect(mergeTags(stored, [{ direction: 1, adjective: 'loud' }], ['loud', 'long'])).toEqual([
      { direction: 1, adjective: 'loud' },
    ]);
  });

  it('never removes when the form was not prefilled', () => {
    expect(mergeTags(stored, [{ direction: 1, adjective: 'loud' }], [])).toEqual(stored);
  });
});
