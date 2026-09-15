import { randomSentences } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
  return { sentences: randomSentences() };
};
