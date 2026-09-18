<script lang="ts">
  import { reviewSentence } from '@is-not/sentence';
  import { prefersReducedMotion } from 'svelte/motion';
  import type { Subject, Tag } from '@is-not/lenses';
  import { m } from '$lib/paraglide/messages.js';
  import { getLocale } from '$lib/paraglide/runtime.js';
  import SentenceHero from '$lib/SentenceHero.svelte';
  import SubjectLinks from '$lib/SubjectLinks.svelte';

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
      stale: boolean;
    };
  } = $props();

  const parts = $derived(
    reviewSentence(
      { subject: review.subject, tags: review.tags, locale: review.locale },
      { locale: getLocale(), who: { handle: review.handle, did: review.did } },
    ),
  );
</script>

<SentenceHero title={heading} {parts} animate={!prefersReducedMotion.current}>
  <div class="links">
    <SubjectLinks subject={review.subject} />
  </div>
  <a class="pill" href={`/review?subject=${encodeURIComponent(review.subject.uri)}`}>
    {m.review_it_yourself()}
  </a>
  {#if review.stale}
    <p class="stale">
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3 2 21h20zM12 10v5m0 3v.5" /></svg>
      {m.review_earlier_version()}
    </p>
  {/if}
</SentenceHero>

<style>
  .links {
    flex-basis: 100%;
    --icon-size: 40px;
  }
  .stale {
    flex-basis: 100%;
    margin: 0;
    display: inline-flex;
    justify-content: center;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--step--1);
    color: var(--ink-soft);
  }
  .stale svg {
    display: block;
  }
</style>
