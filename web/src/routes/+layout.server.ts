import type { LayoutServerLoad } from './$types';
import { accountsFor, avatarFor } from '$lib/server/accounts';
import { origin } from '$lib/server/oauth';

export const load: LayoutServerLoad = async ({ locals }) => {
  const { accounts, current } = await accountsFor(locals.browser);
  return { accounts, current, avatar: current ? avatarFor(current.did) : null, origin: origin() };
};
