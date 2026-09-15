import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ensureBrowser } from '$lib/server/cookie';
import { switchAccount } from '$lib/server/sessions';

export const POST: RequestHandler = async ({ request, cookies }) => {
  const did = String((await request.formData().catch(() => new FormData())).get('did') ?? '');
  const browser = ensureBrowser(cookies);
  switchAccount(browser.id, did);
  redirect(303, '/review');
};
