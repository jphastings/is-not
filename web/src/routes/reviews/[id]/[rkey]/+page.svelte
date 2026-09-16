<script lang="ts">
  import { reviewSentence } from '@is-not/sentence';
  import { prefersReducedMotion } from 'svelte/motion';
  import { m } from '$lib/paraglide/messages.js';
  import { getLocale } from '$lib/paraglide/runtime.js';
  import SentenceHero from '$lib/SentenceHero.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const parts = $derived(
    reviewSentence(
      { subject: data.review.subject, tags: data.review.tags, locale: data.review.locale },
      {
        locale: getLocale(),
        who: { handle: data.review.handle || data.review.did, did: data.review.did },
      },
    ),
  );
</script>

<svelte:head>
  <title>{m.reviews_title({ who: data.heading })}</title>
</svelte:head>

<SentenceHero title={data.heading} {parts} animate={!prefersReducedMotion.current}>
  <a class="pill" href={`/review?subject=${encodeURIComponent(data.review.subject.uri)}`}>
    {m.review_it_yourself()}
  </a>
</SentenceHero>
