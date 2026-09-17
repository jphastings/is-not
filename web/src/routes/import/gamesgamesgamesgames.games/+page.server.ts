import type { Actions, PageServerLoad } from './$types';
import { importAction, importLoad } from '$lib/server/importers';
import { previewGamesGamesGamesGamesImport } from '$lib/server/gamesgamesgamesgames';

export const load: PageServerLoad = importLoad(
  'gamesgamesgamesgames.games',
  previewGamesGamesGamesGamesImport,
);

export const actions: Actions = { import: importAction };
