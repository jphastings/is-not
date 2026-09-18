import type { Tag } from '@is-not/lenses';
import { describe, expect, it } from 'vite-plus/test';
import {
  checkSubjectUri,
  goodTagDirection,
  mergeTags,
  validateReview,
  withGoodTag,
} from './review';

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

  it('fails when the subject uri has only two parts (an authority alone)', () => {
    const subject = { ...validSubject, uri: 'at://did:plc:ephkzpinhaqcabtkugtbzrwu' };
    const result = validateReview({ subject, tags: [{ adjective: 'loud', direction: 1 }] });
    expect(result).toEqual({ ok: false, error: 'subject' });
  });

  it('fails when the subject is a person (a profile record)', () => {
    const subject = { ...validSubject, uri: 'at://did:plc:x/app.bsky.actor.profile/self' };
    const result = validateReview({ subject, tags: [{ adjective: 'loud', direction: 1 }] });
    expect(result).toEqual({ ok: false, error: 'subject_person' });
  });

  it('keeps subject identifiers', () => {
    const subject = { ...validSubject, identifiers: [{ key: 'mbid', value: 'abc-123' }] };
    const result = validateReview({ subject, tags: [{ adjective: 'loud', direction: 1 }] });
    expect(result).toEqual({
      ok: true,
      value: {
        subject,
        tags: [{ adjective: 'loud', direction: 1 }],
        prefilled: [],
      },
    });
  });

  it('omits the identifiers key when there are none', () => {
    const result = validateReview({
      subject: validSubject,
      tags: [{ adjective: 'loud', direction: 1 }],
    });
    expect(result.ok && 'identifiers' in result.value.subject).toBe(false);
  });

  it('rejects malformed identifiers (a value that is not a string)', () => {
    const subject = { ...validSubject, identifiers: [{ key: 'mbid', value: 123 }] };
    const result = validateReview({ subject, tags: [{ adjective: 'loud', direction: 1 }] });
    expect(result).toEqual({ ok: false, error: 'subject' });
  });
});

describe('checkSubjectUri', () => {
  it('accepts a three-part record uri', () => {
    expect(checkSubjectUri('at://did:web:x/app.bsky.feed.post/1')).toBeNull();
  });

  it('rejects a bare handle or DID (not a record)', () => {
    expect(checkSubjectUri('at://byjp.me')).toBe('subject');
    expect(checkSubjectUri('at://did:plc:ephkzpinhaqcabtkugtbzrwu')).toBe('subject');
  });

  it('rejects any collection ending in .profile', () => {
    expect(checkSubjectUri('at://did:plc:x/app.bsky.actor.profile/self')).toBe('subject_person');
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

describe('goodTagDirection', () => {
  it('finds the tag by trimmed, case-insensitive adjective', () => {
    expect(goodTagDirection([{ direction: 1, adjective: ' Good ' }], 'good')).toBe(1);
  });

  it('returns null when there is no good tag', () => {
    expect(goodTagDirection([{ direction: 1, adjective: 'loud' }], 'good')).toBeNull();
  });
});

describe('withGoodTag', () => {
  it('replaces the lone blank placeholder tag when setting a direction', () => {
    expect(withGoodTag([{ direction: 1, adjective: '' }], -1, 'good')).toEqual([
      { direction: -1, adjective: 'good' },
    ]);
  });

  it('appends the good tag alongside other tags', () => {
    expect(withGoodTag([{ direction: 1, adjective: 'loud' }], 2, 'good')).toEqual([
      { direction: 1, adjective: 'loud' },
      { direction: 2, adjective: 'good' },
    ]);
  });

  it('updates an existing good tag in place, preserving its position and spelling', () => {
    const tags: Tag[] = [
      { direction: 1, adjective: 'loud' },
      { direction: -1, adjective: 'Good' },
    ];
    expect(withGoodTag(tags, 2, 'good')).toEqual([
      { direction: 1, adjective: 'loud' },
      { direction: 2, adjective: 'Good' },
    ]);
  });

  it('removes the good tag, falling back to a blank placeholder if nothing is left', () => {
    expect(withGoodTag([{ direction: 1, adjective: 'good' }], null, 'good')).toEqual([
      { direction: 1, adjective: '' },
    ]);
  });

  it('removes only the good tag, keeping the others', () => {
    const tags: Tag[] = [
      { direction: 1, adjective: 'loud' },
      { direction: -1, adjective: 'good' },
    ];
    expect(withGoodTag(tags, null, 'good')).toEqual([{ direction: 1, adjective: 'loud' }]);
  });

  it('clearing when there is no good tag is a no-op', () => {
    const tags: Tag[] = [{ direction: 1, adjective: 'loud' }];
    expect(withGoodTag(tags, null, 'good')).toBe(tags);
  });
});
