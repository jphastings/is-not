<script lang="ts">
  import { reviewSentence } from '@is-not/sentence';
  import { prefersReducedMotion } from 'svelte/motion';
  import { m } from '$lib/paraglide/messages.js';
  import { getLocale } from '$lib/paraglide/runtime.js';
  import Sentence from '$lib/Sentence.svelte';
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
</svelte:head>

<main>
  <h1>{m.site_title()}</h1>

  {#if current}
    <p class="display sentence">
      {#key i}
        <Sentence {parts} animate={!prefersReducedMotion.current} />
      {/key}
    </p>
  {:else}
    <p class="display sentence">{m.empty_state()}</p>
  {/if}

  <div class="actions">
    <a class="pill" href="/review">{m.review_something()}</a>
    <a class="pill secondary" href="/docs">{m.docs()}</a>
  </div>
</main>

<style>
  main {
    padding: var(--space-5);
    max-width: 58rem;
    margin-inline: auto;
    min-height: 100dvh;
    display: grid;
    align-content: center;
    justify-items: center;
    text-align: center;
    gap: var(--space-6);
  }

  h1 {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }

  .sentence {
    font-size: var(--step-5);
    margin: 0;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--space-4);
  }
</style>
