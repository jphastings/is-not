import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ensureBrowser } from '$lib/server/cookie';
import { oauthClient } from '$lib/server/oauth';
import { linkState } from '$lib/server/sessions';

export const POST: RequestHandler = async ({ request, cookies }) => {
  const form = await request.formData().catch(() => new FormData());
  const handle = String(form.get('handle') ?? '')
    .trim()
    .replace(/^@/, '');
  const browser = ensureBrowser(cookies);
  // Without a handle the entryway asks who they are. Accounts hosted elsewhere
  // need their handle, which no surface collects yet (bean ISNOT-iik2).
  const url = await (
    await oauthClient()
  ).authorize(handle || 'https://bsky.social', {
    state: linkState(browser.id),
  });
  redirect(303, url.toString());
};
