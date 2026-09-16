import type { PageServerLoad } from './$types';
import { accountsFor, agentFor } from '$lib/server/accounts';
import { IMPORTERS } from '$lib/server/importers';

export type ImporterListing = { domain: string; available: boolean };

const allAvailable = (): ImporterListing[] =>
  IMPORTERS.map(({ domain }) => ({ domain, available: true }));

export const load: PageServerLoad = async ({ locals }) => {
  const { current } = await accountsFor(locals.browser);
  if (!current) return { importers: allAvailable() };

  const agent = await agentFor(current.did);
  if (!agent) return { importers: allAvailable() };

  try {
    const { data } = await agent.com.atproto.repo.describeRepo({ repo: current.did });
    const collections = new Set(data.collections);
    const importers = IMPORTERS.map(({ domain, collections: needed }) => ({
      domain,
      available: needed.some((c) => collections.has(c)),
    })).sort((a, b) => Number(b.available) - Number(a.available));
    return { importers };
  } catch (e) {
    console.error('describeRepo failed', e);
    return { importers: allAvailable() };
  }
};
