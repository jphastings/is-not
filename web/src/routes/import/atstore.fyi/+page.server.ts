import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { accountsFor, agentFor } from '$lib/server/accounts';
import { previewAtstoreImport, type ImportRow } from '$lib/server/atstore';
import { saveReview } from '$lib/server/reviews';
import { validateReview } from '$lib/review';

export const load: PageServerLoad = async ({ locals }) => {
  const { accounts, current } = await accountsFor(locals.browser);
  if (!current) return { accounts, current: null, rows: [] as ImportRow[], error: null };

  const agent = await agentFor(current.did);
  if (!agent) return { accounts, current: null, rows: [] as ImportRow[], error: null };

  try {
    const rows = await previewAtstoreImport(current.did, agent);
    return { accounts, current, rows, error: null };
  } catch (e) {
    console.error('atstore.fyi import preview failed', e);
    return { accounts, current, rows: [] as ImportRow[], error: 'pds' };
  }
};

export const actions: Actions = {
  import: async ({ request, locals }) => {
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
  },
};
