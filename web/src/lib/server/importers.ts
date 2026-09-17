import type { Agent } from '@atproto/api';
import { fail } from '@sveltejs/kit';
import type { RequestEvent, ServerLoadEvent } from '@sveltejs/kit';
import type { Tag } from '@is-not/lenses';
import { accountsFor, agentFor, type Account } from './accounts.ts';
import { findReview } from './db.ts';
import { saveReview } from './reviews.ts';
import { validateReview } from '$lib/review';
import { m } from '$lib/paraglide/messages.js';
import { getLocale } from '$lib/paraglide/runtime.js';

export type ImportRow = {
  subjectUri: string;
  sources: string[];
  /** This account's existing review of the subject, if it has one — null for a fresh import. */
  existing: Tag[] | null;
  /** The oldest source record's own createdAt: an imported opinion is that old. */
  createdAt?: string;
};

export type ListedRecord = { uri: string; value: Record<string, unknown> };

const isString = (v: unknown): v is string => typeof v === 'string';

/** Keeps the earlier of two dates, ignoring anything that isn't a valid date string. */
export const earliest = (a: string | undefined, b: unknown) =>
  isString(b) && !Number.isNaN(Date.parse(b)) && (a === undefined || b < a) ? b : a;

export async function listAll(
  agent: Agent,
  did: string,
  collection: string,
): Promise<ListedRecord[]> {
  const records: ListedRecord[] = [];
  let cursor: string | undefined;
  do {
    const res = await agent.com.atproto.repo.listRecords({
      repo: did,
      collection,
      cursor,
      limit: 100,
    });
    records.push(...(res.data.records as ListedRecord[]));
    cursor = res.data.cursor;
  } while (cursor);
  return records;
}

/** Every registered importer, in the order `/import` lists them; `collections`
    is what `/import`'s availability check looks for in `describeRepo`. Keep
    in sync with each importer's own preview() by hand — the two are in
    different files so a preview reading a new collection doesn't force a
    circular import just to update this list. */
export const IMPORTERS: { domain: string; collections: string[] }[] = [
  {
    domain: 'atstore.fyi',
    collections: ['fyi.atstore.listing.favorite', 'fyi.atstore.listing.review'],
  },
  { domain: 'bookhive.buzz', collections: ['buzz.bookhive.book'] },
  {
    domain: 'gamesgamesgamesgames.games',
    collections: ['games.gamesgamesgamesgames.graph.like'],
  },
  { domain: 'rocksky.app', collections: ['app.rocksky.like'] },
  { domain: 'standard.site', collections: ['site.standard.graph.recommend'] },
  { domain: 'popfeed.social', collections: ['social.popfeed.feed.review'] },
];

/** Shared shape for a "did I do this to that subject" collection — a like, a
    favourite, a recommend — where the record itself carries no opinion, just
    presence. One row per distinct subject, sources always `[source]`, kept
    to the earliest createdAt if the same subject appears more than once. */
export async function previewPresenceImport(
  did: string,
  agent: Agent,
  locale: string,
  collection: string,
  source: string,
  subjectOf: (value: Record<string, unknown>) => string | undefined,
): Promise<ImportRow[]> {
  const records = await listAll(agent, did, collection);
  const bySubject = new Map<string, string | undefined>();
  for (const record of records) {
    const subjectUri = subjectOf(record.value);
    if (!subjectUri) continue;
    bySubject.set(subjectUri, earliest(bySubject.get(subjectUri), record.value.createdAt));
  }
  return [...bySubject.entries()].map(([subjectUri, createdAt]) => ({
    subjectUri,
    sources: [source],
    createdAt,
    existing: findReview(did, subjectUri, locale)?.tags ?? null,
  }));
}

type LoadResult = {
  description: string;
  accounts: Account[];
  current: Account | null;
  rows: ImportRow[];
  error: string | null;
};

/** Builds a route's `load`: sign-in and PDS-failure handling are identical
    across importers, only how a row is built from the records differs. */
export function importLoad(
  domain: string,
  preview: (did: string, agent: Agent, locale: string) => Promise<ImportRow[]>,
) {
  return async ({ locals }: ServerLoadEvent): Promise<LoadResult> => {
    const description = m.meta_import_domain({ domain });
    const { accounts, current } = await accountsFor(locals.browser);
    if (!current) return { accounts, current: null, rows: [], error: null, description };

    const agent = await agentFor(current.did);
    if (!agent) return { accounts, current: null, rows: [], error: null, description };

    try {
      // Rows are saved in the page's locale, so that's the review they'd join.
      const rows = await preview(current.did, agent, getLocale());
      return { accounts, current, rows, error: null, description };
    } catch (e) {
      console.error('import preview failed', e);
      return { accounts, current, rows: [], error: 'pds', description };
    }
  };
}

/** The `?/import` form action every importer route shares: each selected row
    arrives as a hidden `row` field holding a `ReviewInput`-shaped JSON blob. */
export async function importAction({ request, locals }: RequestEvent) {
  const did = locals.browser?.current;
  if (!did) return fail(401, { error: 'signin' });

  const form = await request.formData();
  const rows = form.getAll('row').map((raw) => JSON.parse(String(raw)) as unknown);

  // One repo means one commit chain, and a PDS may reject the losers of a
  // race, so the rows go out in turn rather than all at once.
  const results = [];
  for (const row of rows) {
    const uri =
      typeof row === 'object' && row !== null && 'subject' in row
        ? ((row.subject as { uri?: unknown })?.uri ?? '')
        : '';
    const parsed = validateReview(row);
    if (!parsed.ok) {
      results.push({ uri: String(uri), ok: false as const, error: parsed.error });
      continue;
    }
    const result = await saveReview(did, parsed.value);
    results.push(
      result.ok
        ? { uri: String(uri), ok: true as const, savedUri: result.uri }
        : { uri: String(uri), ok: false as const, error: result.error },
    );
  }

  return { results };
}
