import type { Actions, PageServerLoad } from './$types';
import { importAction, importLoad } from '$lib/server/importers';
import { previewStandardImport } from '$lib/server/standard';

export const load: PageServerLoad = importLoad('standard.site', previewStandardImport);

export const actions: Actions = { import: importAction };
