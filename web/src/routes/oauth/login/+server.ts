import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ensureBrowser } from '$lib/server/cookie';
import { oauthClient } from '$lib/server/oauth';
import { linkState } from '$lib/server/sessions';

export const POST: RequestHandler = async ({ request, cookies }) => {
  const form = await request.formData().catch(() => new FormData());
  const pds = String(form.get('pds') ?? '').trim();
  const handle = String(form.get('handle') ?? '')
    .trim()
    .replace(/^@/, '');
  // A named service wins: it is the one they clicked. Otherwise the client
  // resolves the handle or DID to whichever PDS hosts that account.
  const account = pds || handle;
  if (!account) redirect(303, '/review?error=handle');

  const browser = ensureBrowser(cookies);
  const state = linkState(browser.id);
  let url: URL;
  try {
    url = await (await oauthClient()).authorize(account, { state });
  } catch (err) {
    console.error('authorize failed for', account, err);
    redirect(303, '/review?error=handle');
  }
  redirect(303, url.toString());
};
