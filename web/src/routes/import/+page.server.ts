import type { PageServerLoad } from './$types';
import { accountsFor, agentFor } from '$lib/server/accounts';
import { IMPORTERS } from '$lib/server/importers';
import { m } from '$lib/paraglide/messages.js';

export type ImporterListing = { domain: string; available: boolean };

const allAvailable = (): ImporterListing[] =>
  IMPORTERS.map(({ domain }) => ({ domain, available: true }));

export const load: PageServerLoad = async ({ locals }) => ({
  importers: await importers(locals.browser),
  description: m.meta_import(),
});

async function importers(browser: App.Locals['browser']): Promise<ImporterListing[]> {
  const { current } = await accountsFor(browser);
  if (!current) return allAvailable();

  const agent = await agentFor(current.did);
  if (!agent) return allAvailable();

  try {
    const { data } = await agent.com.atproto.repo.describeRepo({ repo: current.did });
    const collections = new Set(data.collections);
    return IMPORTERS.map(({ domain, collections: needed }) => ({
      domain,
      available: needed.some((c) => collections.has(c)),
    })).sort((a, b) => Number(b.available) - Number(a.available));
  } catch (e) {
    console.error('describeRepo failed', e);
    return allAvailable();
  }
}
