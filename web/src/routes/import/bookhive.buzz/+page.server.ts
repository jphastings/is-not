import type { Actions, PageServerLoad } from './$types';
import { importAction, importLoad } from '$lib/server/importers';
import { previewBookhiveImport } from '$lib/server/bookhive';

export const load: PageServerLoad = importLoad(previewBookhiveImport);

export const actions: Actions = { import: importAction };
