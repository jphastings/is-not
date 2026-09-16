<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Part } from '@is-not/sentence';
  import Sentence from '$lib/Sentence.svelte';

  let {
    title,
    parts,
    animate = true,
    empty,
    key,
    children,
  }: {
    title: string;
    parts: Part[];
    animate?: boolean;
    empty?: string;
    /** Forces the sentence to remount (replaying its fade-in) when this changes. */
    key?: unknown;
    children: Snippet;
  } = $props();
</script>

<main>
  <h1>{title}</h1>

  {#if parts.length > 0}
    <p class="display sentence">
      {#key key}
        <Sentence {parts} {animate} linkWho linkSubject />
      {/key}
    </p>
  {:else}
    <p class="display sentence">{empty}</p>
  {/if}

  <div class="actions">
    {@render children()}
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
