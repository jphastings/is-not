import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { oauthClient } from '$lib/server/oauth';

export const GET: RequestHandler = async () => json((await oauthClient()).clientMetadata);
