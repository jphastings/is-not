import type { PageServerLoad } from './$types';
import { accountsFor } from '$lib/server/accounts';
import { m } from '$lib/paraglide/messages.js';

export const load: PageServerLoad = async ({ locals }) => ({
  ...(await accountsFor(locals.browser)),
  description: m.meta_docs(),
});
