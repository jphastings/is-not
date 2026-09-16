import type { PageServerLoad } from './$types';
import { accountsFor } from '$lib/server/accounts';

export const load: PageServerLoad = async ({ locals }) => accountsFor(locals.browser);
