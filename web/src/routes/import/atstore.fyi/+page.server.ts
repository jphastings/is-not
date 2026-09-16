import type { Actions, PageServerLoad } from './$types';
import { importAction, importLoad } from '$lib/server/importers';
import { previewAtstoreImport } from '$lib/server/atstore';

export const load: PageServerLoad = importLoad('atstore.fyi', previewAtstoreImport);

export const actions: Actions = { import: importAction };
