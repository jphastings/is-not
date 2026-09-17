import type { Actions, PageServerLoad } from './$types';
import { importAction, importLoad } from '$lib/server/importers';
import { previewPopfeedImport } from '$lib/server/popfeed';

export const load: PageServerLoad = importLoad('popfeed.social', previewPopfeedImport);

export const actions: Actions = { import: importAction };
