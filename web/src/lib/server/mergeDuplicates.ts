import type { ReviewRecord, Tag } from '@is-not/lenses';
import { sortTags } from '@is-not/sentence';
import { fold } from '$lib/review';

const MAX_TAGS = 32;

export type DupRecord = { rkey: string; value: ReviewRecord };
export type MergeResult = { keeper: string; record: ReviewRecord; deletes: string[] } | null;

type Candidate = { tag: Tag; updatedAt: number };

// Other apps may write any valid datetime (offsets, no milliseconds), so
// compare instants, never strings.
const time = (datetime: string) => Date.parse(datetime);

/** Later `updatedAt` wins; on a tie the direction nearer 0 wins; on a further
    tie (+1/-1, +2/-2) the positive direction wins. */
function beats(candidate: Candidate, current: Candidate | undefined): boolean {
  if (!current) return true;
  if (candidate.updatedAt !== current.updatedAt) return candidate.updatedAt > current.updatedAt;
  const candidateAbs = Math.abs(candidate.tag.direction);
  const currentAbs = Math.abs(current.tag.direction);
  if (candidateAbs !== currentAbs) return candidateAbs < currentAbs;
  return candidate.tag.direction > current.tag.direction;
}

function mergeAllTags(records: DupRecord[]): Tag[] {
  const byAdjective = new Map<string, Candidate>();
  for (const record of records) {
    for (const tag of record.value.tags) {
      const candidate = { tag, updatedAt: time(record.value.updatedAt) };
      if (beats(candidate, byAdjective.get(fold(tag.adjective)))) {
        byAdjective.set(fold(tag.adjective), candidate);
      }
    }
  }
  return sortTags([...byAdjective.values()].map((c) => c.tag));
}

/** Earliest `createdAt`; ties broken by the smaller rkey. */
function pickKeeper(records: DupRecord[]): DupRecord {
  return records.reduce((a, b) => {
    const [ta, tb] = [time(a.value.createdAt), time(b.value.createdAt)];
    if (ta !== tb) return ta < tb ? a : b;
    return a.rkey < b.rkey ? a : b;
  });
}

const latestOf = (records: DupRecord[]): DupRecord =>
  records.reduce((a, b) => (time(b.value.updatedAt) > time(a.value.updatedAt) ? b : a));

const deepEqual = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * Merges a group of `at.isnot.review` records that all describe the same
 * (normalised) subject into the one to keep and the rest to delete. Returns
 * null when there's nothing to write: the merge would exceed the 32-tag save
 * limit (logged and skipped), or the merged record already matches the
 * keeper with nothing left to delete.
 */
export function mergeDuplicates(records: DupRecord[], normalizedUri: string): MergeResult {
  if (records.length === 0) return null;

  const tags = mergeAllTags(records);
  if (tags.length > MAX_TAGS) {
    console.warn(
      `merge-duplicates: skipping ${normalizedUri}, merge would give ${tags.length} tags (max ${MAX_TAGS})`,
    );
    return null;
  }

  const keeper = pickKeeper(records);
  const latest = latestOf(records);
  const createdAt = keeper.value.createdAt;
  const updatedAt = latest.value.updatedAt;

  const record: ReviewRecord = {
    ...latest.value,
    subject: { ...latest.value.subject, uri: normalizedUri },
    tags,
    createdAt,
    updatedAt,
  };

  const deletes = records.filter((r) => r.rkey !== keeper.rkey).map((r) => r.rkey);
  if (deletes.length === 0 && deepEqual(record, keeper.value)) return null;

  return { keeper: keeper.rkey, record, deletes };
}
