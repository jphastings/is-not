import type { PageServerLoad } from './$types';
import { accountsFor } from '$lib/server/accounts';
import { randomSubject } from '$lib/server/db';
import { m } from '$lib/paraglide/messages.js';

export const load: PageServerLoad = async ({ locals }) => ({
  ...(await accountsFor(locals.browser)),
  description: m.meta_docs(),
  initialSubject: randomSubject() ?? undefined,
});
