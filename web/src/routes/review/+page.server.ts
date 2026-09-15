import { fail } from '@sveltejs/kit';
import { TID } from '@atproto/common-web';
import type { Actions, PageServerLoad } from './$types';
import { accountsFor, agentFor } from '$lib/server/accounts';
import { findReview } from '$lib/server/db';
import { mergeTags, validateReview } from '$lib/review';

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
    const { subject, tags, locale, prefilled = [] } = parsed.value;
    const existing = findReview(did, subject.uri);
    // One review per subject per person: a new opinion joins the record already there.
    const merged = existing ? mergeTags(existing.tags, tags, prefilled) : tags;
    if (merged.length > 32) return fail(400, { error: 'tags' });
    const now = new Date().toISOString();
    const record = {
      $type: 'at.isnot.review',
      subject,
      tags: merged,
      ...(locale ? { locale } : {}),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    try {
      const agent = await agentFor(did);
      if (!agent) return fail(401, { error: 'signin' });
      const rkey = existing?.rkey ?? TID.nextStr();
      const res = existing
        ? await agent.com.atproto.repo.putRecord({
            repo: did,
            collection: 'at.isnot.review',
            rkey,
            record,
          })
        : await agent.com.atproto.repo.createRecord({
            repo: did,
            collection: 'at.isnot.review',
            rkey,
            record,
          });
      return { uri: res.data.uri };
    } catch (e) {
      console.error('save failed', e);
      return fail(502, { error: 'pds' });
    }
  },
};
