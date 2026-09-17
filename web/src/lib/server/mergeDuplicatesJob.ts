import type { ReviewRecord } from '@is-not/lenses';
import { RECORD_URI } from '$lib/review';
import { agentFor, handleDid } from './accounts.ts';
import { mergeDuplicates, type DupRecord } from './mergeDuplicates.ts';
import { allSessionDids } from './sessions.ts';

const COLLECTION = 'at.isnot.review';
const INITIAL_DELAY_MS = 10_000;
const INTERVAL_MS = 60 * 60 * 1000;

/** Resolves a subject uri's authority to a DID, leaving already-`did:`
    authorities alone. Returns null when a handle authority can't be
    resolved: the caller then leaves that record alone rather than guessing. */
async function normalizeSubjectUri(uri: string): Promise<string | null> {
  const match = RECORD_URI.exec(uri);
  if (!match) return null;
  const [, authority, collection, rkey] = match;
  if (authority.startsWith('did:')) return uri;
  const did = await handleDid(authority);
  return did ? `at://${did}/${collection}/${rkey}` : null;
}

type Group = { normalizedUri: string; records: DupRecord[] };

/** Duplicates share a subject *and* a locale: reviews of one thing written in
    different locales are separate reviews, never merged. */
async function groupBySubject(records: DupRecord[]): Promise<Group[]> {
  const groups = new Map<string, Group>();
  for (const record of records) {
    const normalizedUri = await normalizeSubjectUri(record.value.subject.uri);
    if (!normalizedUri) continue; // can't resolve authority; leave this record alone
    const key = JSON.stringify([normalizedUri, record.value.locale ?? '']);
    const group = groups.get(key) ?? { normalizedUri, records: [] };
    group.records.push(record);
    groups.set(key, group);
  }
  return [...groups.values()];
}

async function listOwnReviews(
  agent: NonNullable<Awaited<ReturnType<typeof agentFor>>>,
  did: string,
): Promise<DupRecord[]> {
  const records: DupRecord[] = [];
  let cursor: string | undefined;
  do {
    const res = await agent.com.atproto.repo.listRecords({
      repo: did,
      collection: COLLECTION,
      limit: 100,
      cursor,
    });
    for (const r of res.data.records) {
      const match = RECORD_URI.exec(r.uri);
      if (match) records.push({ rkey: match[3], value: r.value as ReviewRecord });
    }
    cursor = res.data.cursor;
  } while (cursor);
  return records;
}

/** Merges one account's duplicate `at.isnot.review` records, read live from
    its PDS. A group is handled when it has more than one record, or its one
    record's subject uri wasn't normalised yet; an untouched, already-merged
    repo makes no write at all. */
async function mergeAccount(did: string): Promise<void> {
  const agent = await agentFor(did);
  if (!agent) return; // session no longer usable

  let swapCommit: string;
  try {
    swapCommit = (await agent.com.atproto.sync.getLatestCommit({ did })).data.cid;
  } catch (e) {
    console.error(`merge-duplicates: couldn't read repo head for ${did}`, e);
    return;
  }

  let records: DupRecord[];
  try {
    records = await listOwnReviews(agent, did);
  } catch (e) {
    console.error(`merge-duplicates: couldn't list reviews for ${did}`, e);
    return;
  }

  const groups = await groupBySubject(records);
  for (const { normalizedUri, records: group } of groups) {
    const needsHandling = group.length > 1 || group[0].value.subject.uri !== normalizedUri;
    if (!needsHandling) continue;

    const result = mergeDuplicates(group, normalizedUri);
    if (!result) continue;

    try {
      const res = await agent.com.atproto.repo.applyWrites({
        repo: did,
        swapCommit,
        writes: [
          {
            $type: 'com.atproto.repo.applyWrites#update',
            collection: COLLECTION,
            rkey: result.keeper,
            value: result.record,
          },
          ...result.deletes.map((rkey) => ({
            $type: 'com.atproto.repo.applyWrites#delete' as const,
            collection: COLLECTION,
            rkey,
          })),
        ],
      });
      // Each write moves the repo head; the next group swaps against the commit
      // this one made, so only our own writes can come between listing and it.
      if (res.data.commit) swapCommit = res.data.commit.cid;
    } catch (e) {
      console.error(`merge-duplicates: applyWrites failed for ${did} ${normalizedUri}`, e);
      return; // the head has moved under us; later swaps would fail too, so retry next run
    }
  }
}

let running = false;

async function runOnce(): Promise<void> {
  if (running) return; // never let the job overlap itself
  running = true;
  try {
    for (const did of allSessionDids()) {
      try {
        await mergeAccount(did);
      } catch (e) {
        console.error(`merge-duplicates: failed for ${did}`, e);
      }
    }
  } finally {
    running = false;
  }
}

let started = false;

/** Runs shortly after server start, then hourly, one account at a time,
    covering only the accounts the server currently holds an oauth session
    for. */
export function startMergeDuplicatesJob(): void {
  if (started) return;
  started = true;
  setTimeout(runOnce, INITIAL_DELAY_MS);
  setInterval(runOnce, INTERVAL_MS);
}
