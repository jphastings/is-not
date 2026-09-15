import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { COOKIE } from '$lib/server/cookie';
import { getBrowser } from '$lib/server/sessions';

const accounts: Handle = ({ event, resolve }) => {
  event.locals.browser = getBrowser(event.cookies.get(COOKIE));
  return resolve(event);
};

const paraglideHandle: Handle = ({ event, resolve }) =>
  paraglideMiddleware(event.request, ({ request, locale }) => {
    event.request = request;
    return resolve(event, {
      transformPageChunk: ({ html }) => html.replace('%lang%', locale).replace('%dir%', 'ltr'),
    });
  });

export const handle = sequence(accounts, paraglideHandle);
