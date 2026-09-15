import type { Cookies } from '@sveltejs/kit';
import { origin } from './oauth.ts';
import { getBrowser, newBrowser, type Browser } from './sessions.ts';

export const COOKIE = 'isnot_browser';

export function ensureBrowser(cookies: Cookies): Browser {
  const existing = getBrowser(cookies.get(COOKIE));
  if (existing) return existing;
  const b = newBrowser();
  cookies.set(COOKIE, b.id, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: origin().startsWith('https'),
    maxAge: 60 * 60 * 24 * 90,
  });
  return b;
}
