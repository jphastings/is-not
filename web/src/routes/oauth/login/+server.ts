import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ensureBrowser } from '$lib/server/cookie';
import { oauthClient } from '$lib/server/oauth';
import { linkState } from '$lib/server/sessions';

export const POST: RequestHandler = async ({ request, cookies }) => {
  const handle = String((await request.formData()).get('handle') ?? '')
    .trim()
    .replace(/^@/, '');
  if (!handle) redirect(303, '/review?error=handle');
  const browser = ensureBrowser(cookies);
  const url = await (await oauthClient()).authorize(handle, { state: linkState(browser.id) });
  redirect(303, url.toString());
};
