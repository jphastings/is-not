import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { accountsFor } from '$lib/server/accounts';
import { deleteReviewAction } from '$lib/server/deleteReview';
import { saveReview } from '$lib/server/reviews';
import { validateReview } from '$lib/review';

export const load: PageServerLoad = async ({ locals, url }) => ({
  ...(await accountsFor(locals.browser)),
  error: url.searchParams.get('error'),
});

export const actions: Actions = {
  save: async ({ request, locals }) => {
    const did = locals.browser?.current;
    if (!did) return fail(401, { error: 'signin' });
    const form = await request.formData();
    const parsed = validateReview(JSON.parse(String(form.get('review') ?? 'null')));
    if (!parsed.ok) return fail(400, { error: parsed.error });
    const result = await saveReview(did, parsed.value);
    return result.ok ? { uri: result.uri } : fail(result.status, { error: result.error });
  },
  delete: deleteReviewAction,
};
