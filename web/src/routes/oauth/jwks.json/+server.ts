import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { oauthClient, publicJwks } from '$lib/server/oauth';

export const GET: RequestHandler = async () => json(publicJwks((await oauthClient()).jwks));
