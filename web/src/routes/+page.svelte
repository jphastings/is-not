<script lang="ts">
  import { reviewSentence } from '@is-not/sentence';
  import { prefersReducedMotion } from 'svelte/motion';
  import { m } from '$lib/paraglide/messages.js';
  import { getLocale } from '$lib/paraglide/runtime.js';
  import SentenceHero from '$lib/SentenceHero.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  let i = $state(0);
  const current = $derived(data.sentences[i]);
  const parts = $derived(
    current
      ? reviewSentence(current, {
          locale: getLocale(),
          who: { handle: current.handle || current.did, did: current.did },
        })
      : [],
  );

  // No auto-rotation when motion is reduced: the sentence a reader landed on stays put.
  $effect(() => {
    if (data.sentences.length < 2 || prefersReducedMotion.current) return;
    const id = setInterval(() => (i = (i + 1) % data.sentences.length), 15000);
    return () => clearInterval(id);
  });
</script>

<svelte:head>
  <title>{m.site_title()}</title>
  <meta property="og:title" content={m.site_title()} />
</svelte:head>

<SentenceHero
  title={m.site_title()}
  {parts}
  animate={!prefersReducedMotion.current}
  empty={m.empty_state()}
  key={i}
>
  <a class="pill" href="/review">{m.review_something()}</a>
  <a class="pill secondary" href="/docs">{m.docs()}</a>
</SentenceHero>
