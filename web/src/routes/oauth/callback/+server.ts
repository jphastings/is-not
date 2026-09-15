import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ensureBrowser } from '$lib/server/cookie';
import { oauthClient } from '$lib/server/oauth';
import { addAccount, takeState } from '$lib/server/sessions';

export const GET: RequestHandler = async ({ url, cookies }) => {
  const browser = ensureBrowser(cookies);
  const { session, state } = await (await oauthClient()).callback(url.searchParams);
  if (!state || takeState(state) !== browser.id) redirect(303, '/review?error=state');
  addAccount(browser.id, session.did);
  redirect(303, '/review');
};
