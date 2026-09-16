import type { Subject, Tag } from '@is-not/lenses';

export const RECORD_URI = /^at:\/\/([^/\s]+)\/([^/\s]+)\/([^/\s]+)$/;

// NSIDs that end `.profile` but describe something other than a person, so
// they stay reviewable — none yet. Add exact collection NSIDs here, not a
// pattern, so this stays an explicit exception rather than a loophole.
const PROFILE_ALLOWLIST = new Set<string>();

const isPersonCollection = (collection: string) =>
  collection.endsWith('.profile') && !PROFILE_ALLOWLIST.has(collection);

export type SubjectUriRejection = 'subject' | 'subject_person';

/** Checks an at-uri is reviewable before it's fetched: exactly three parts
    (at://authority/collection/rkey), and not a person — is/not reviews what
    people made or did, not people themselves. */
export function checkSubjectUri(uri: string): SubjectUriRejection | null {
  const match = RECORD_URI.exec(uri.trim());
  if (!match) return 'subject';
  const [, , collection] = match;
  return isPersonCollection(collection) ? 'subject_person' : null;
}

export type ReviewInput = {
  subject: Subject;
  tags: Tag[];
  locale?: string;
  prefilled?: string[];
  /** Only an import sets this: the review is as old as the record it came from. */
  createdAt?: string;
};

type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

const DIRECTIONS = new Set([-2, -1, 0, 1, 2]);
const MAX_TAGS = 32;
const MAX_ADJECTIVE_GRAPHEMES = 16;
const MAX_ADJECTIVE_BYTES = 160;
const MAX_TITLE_GRAPHEMES = 256;

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const graphemeCount = (s: string) => [...segmenter.segment(s)].length;
const byteLength = (s: string) => new TextEncoder().encode(s).length;
const isString = (v: unknown): v is string => typeof v === 'string';

function validateSubject(input: unknown): Validated<Subject> {
  if (typeof input !== 'object' || input === null) return { ok: false, error: 'subject' };
  const s = input as Record<string, unknown>;
  if (!isString(s.uri) || s.uri.trim() === '') return { ok: false, error: 'subject' };
  const rejection = checkSubjectUri(s.uri);
  if (rejection) return { ok: false, error: rejection };
  if (!isString(s.cid) || !isString(s.type)) return { ok: false, error: 'subject' };
  if (
    !isString(s.title) ||
    graphemeCount(s.title) < 1 ||
    graphemeCount(s.title) > MAX_TITLE_GRAPHEMES
  ) {
    return { ok: false, error: 'title' };
  }
  return { ok: true, value: { uri: s.uri, cid: s.cid, title: s.title, type: s.type } };
}

function validateTag(input: unknown): Validated<Tag> {
  if (typeof input !== 'object' || input === null) return { ok: false, error: 'adjective' };
  const t = input as Record<string, unknown>;
  if (!isString(t.adjective)) return { ok: false, error: 'adjective' };
  const adjective = t.adjective.trim();
  const graphemes = graphemeCount(adjective);
  if (
    graphemes < 1 ||
    graphemes > MAX_ADJECTIVE_GRAPHEMES ||
    byteLength(adjective) > MAX_ADJECTIVE_BYTES
  ) {
    return { ok: false, error: 'adjective' };
  }
  if (!DIRECTIONS.has(t.direction as number)) return { ok: false, error: 'direction' };
  return { ok: true, value: { adjective, direction: t.direction as Tag['direction'] } };
}

function validateLocale(input: unknown): Validated<string | undefined> {
  if (input === undefined) return { ok: true, value: undefined };
  if (!isString(input)) return { ok: false, error: 'locale' };
  try {
    new Intl.Locale(input);
  } catch {
    return { ok: false, error: 'locale' };
  }
  return { ok: true, value: input.toLowerCase() };
}

function validateCreatedAt(input: unknown): Validated<string | undefined> {
  if (input === undefined || input === null || input === '') return { ok: true, value: undefined };
  if (!isString(input) || Number.isNaN(Date.parse(input))) {
    return { ok: false, error: 'created' };
  }
  return { ok: true, value: new Date(input).toISOString() };
}

export function validateReview(input: unknown): Validated<ReviewInput> {
  if (typeof input !== 'object' || input === null) return { ok: false, error: 'subject' };
  const raw = input as Record<string, unknown>;

  const subject = validateSubject(raw.subject);
  if (!subject.ok) return subject;

  if (!Array.isArray(raw.tags) || raw.tags.length < 1 || raw.tags.length > MAX_TAGS) {
    return { ok: false, error: 'tags' };
  }
  const tags: Tag[] = [];
  for (const t of raw.tags) {
    const tag = validateTag(t);
    if (!tag.ok) return tag;
    tags.push(tag.value);
  }

  const locale = validateLocale(raw.locale);
  if (!locale.ok) return locale;

  const prefilled = Array.isArray(raw.prefilled) ? raw.prefilled.filter(isString) : [];

  const createdAt = validateCreatedAt(raw.createdAt);
  if (!createdAt.ok) return createdAt;

  return {
    ok: true,
    value: {
      subject: subject.value,
      tags,
      ...(locale.value ? { locale: locale.value } : {}),
      ...(createdAt.value ? { createdAt: createdAt.value } : {}),
      prefilled,
    },
  };
}

export const fold = (adjective: string) => adjective.trim().toLowerCase();

/** Matching is by trimmed, case-folded adjective; the offered spelling wins. */
export function mergeTags(stored: Tag[], offered: Tag[], prefilled: string[]): Tag[] {
  const prefilledKeys = new Set(prefilled.map(fold));
  const offeredByKey = new Map(offered.map((tag) => [fold(tag.adjective), tag]));

  const merged = stored
    .filter(
      (tag) => offeredByKey.has(fold(tag.adjective)) || !prefilledKeys.has(fold(tag.adjective)),
    )
    .map((tag) => offeredByKey.get(fold(tag.adjective)) ?? tag);

  for (const [key, tag] of offeredByKey) {
    if (!stored.some((existing) => fold(existing.adjective) === key)) merged.push(tag);
  }

  return merged;
}
