import type { Actions, PageServerLoad } from './$types';
import { importAction, importLoad } from '$lib/server/importers';
import { previewRockskyImport } from '$lib/server/rocksky';

export const load: PageServerLoad = importLoad('rocksky.app', previewRockskyImport);

export const actions: Actions = { import: importAction };
