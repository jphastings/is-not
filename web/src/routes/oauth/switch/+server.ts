import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ensureBrowser } from '$lib/server/cookie';
import { switchAccount } from '$lib/server/sessions';

export const POST: RequestHandler = async ({ request, cookies }) => {
  const form = await request.formData().catch(() => new FormData());
  const did = String(form.get('did') ?? '');
  const next = String(form.get('next') ?? '');
  const browser = ensureBrowser(cookies);
  switchAccount(browser.id, did);
  redirect(303, next.startsWith('/') && !next.startsWith('//') ? next : '/review');
};
