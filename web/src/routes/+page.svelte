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
  const parts = $derived(current ? reviewSentence(current, { locale: getLocale() }) : []);
  const record = $derived(
    current
      ? {
          $type: 'at.isnot.review',
          subject: current.subject,
          tags: current.tags,
          ...(current.locale ? { locale: current.locale } : {}),
          createdAt: current.createdAt,
          updatedAt: current.updatedAt,
        }
      : null,
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

  <section class="hero">
    {#if current}
      <p class="display sentence">
        {#key i}
          <Sentence {parts} animate={!prefersReducedMotion.current} />
        {/key}
      </p>
      <p class="who">
        {#key i}
          <span>{current.handle ? `@${current.handle}` : current.did}</span>
        {/key}
      </p>
    {:else}
      <p class="display sentence">{m.empty_state()}</p>
    {/if}
    <a class="pill" href="/review">{m.say_something()}</a>
  </section>

  {#if record}
    <section class="record">
      <h2 class="display">{m.for_developers()}</h2>
      <pre><code>{JSON.stringify(record, null, 2)}</code></pre>
      <p>
        {m.record_invite()}
        <a href="https://github.com/jphastings/is-not/blob/main/lexicons/at/isnot/review.json"
          >{m.lexicon_link()}</a
        >
        <a href="https://www.npmjs.com/org/is-not">{m.packages_link()}</a>
      </p>
    </section>
  {/if}
</main>

<style>
  main {
    padding: var(--space-5);
    max-width: 62rem;
    margin-inline: auto;
  }

  h1 {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }

  .hero {
    min-height: 82dvh;
    display: grid;
    align-content: center;
    justify-items: start;
    gap: var(--space-4);
  }

  .sentence {
    font-size: var(--step-5);
    margin: 0;
  }

  .who {
    margin: 0 0 var(--space-4);
    font-size: var(--step-0);
    color: var(--ink-soft);
  }

  .record {
    padding-block: var(--space-7) var(--space-6);
    display: grid;
    gap: var(--space-4);
  }

  h2 {
    font-size: var(--step-2);
    margin: 0;
    max-width: 22ch;
  }

  pre {
    margin: 0;
    padding: var(--space-4);
    background: var(--moss-tint);
    border-radius: 14px;
    overflow-x: auto;
    font-size: var(--step--1);
  }

  .record p {
    margin: 0;
    color: var(--ink-soft);
  }

  .record a {
    color: var(--moss-deep);
    font-weight: 600;
    margin-inline-start: var(--space-3);
  }
</style>
