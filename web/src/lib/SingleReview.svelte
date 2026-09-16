<script lang="ts">
  import { reviewSentence } from '@is-not/sentence';
  import { prefersReducedMotion } from 'svelte/motion';
  import type { Subject, Tag } from '@is-not/lenses';
  import { m } from '$lib/paraglide/messages.js';
  import { getLocale } from '$lib/paraglide/runtime.js';
  import SentenceHero from '$lib/SentenceHero.svelte';

  // Title is set by the caller (`/reviews/[...id]`), which knows the heading
  // for every branch it renders, not just this one.

  let {
    heading,
    review,
  }: {
    heading: string;
    review: {
      did: string;
      handle: string;
      subject: Subject;
      tags: Tag[];
      locale?: string;
    };
  } = $props();

  const parts = $derived(
    reviewSentence(
      { subject: review.subject, tags: review.tags, locale: review.locale },
      { locale: getLocale(), who: { handle: review.handle || review.did, did: review.did } },
    ),
  );
</script>

<SentenceHero title={heading} {parts} animate={!prefersReducedMotion.current}>
  <a class="pill" href={`/review?subject=${encodeURIComponent(review.subject.uri)}`}>
    {m.review_it_yourself()}
  </a>
</SentenceHero>
