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

  <div class="stage">
    {#if parts.length > 0}
      <p class="display sentence">
        {#key key}
          <Sentence {parts} {animate} linkWho />
        {/key}
      </p>
    {:else}
      <p class="display sentence">{empty}</p>
    {/if}

    <div class="actions">
      {@render children()}
    </div>
  </div>
</main>

<style>
  /* The phrase, not the phrase-plus-buttons, sits at the viewport's centre:
     equal flexible rows above and below it, with bottom padding matching the
     header above so their midpoint is the viewport's. The rows shrink to
     nothing before the phrase moves, so a long phrase starts just under the
     header. */
  main {
    --pad: var(--space-5);
    padding: var(--pad) var(--pad) calc(var(--pad) + var(--header-height));
    max-width: 58rem;
    margin-inline: auto;
    min-height: calc(100dvh - 2 * (var(--pad) + var(--header-height)));
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto minmax(0, 1fr);
    justify-items: center;
    text-align: center;
  }

  h1 {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }

  .stage {
    grid-row: 2;
    position: relative;
  }

  .sentence {
    font-size: var(--step-5);
    margin: 0;
  }

  /* Out of flow, hanging below the phrase: in a grid row they would size the
     lower flexible row, and the upper row matches it, pushing a long phrase
     down. They run on past the fold instead. */
  .actions {
    position: absolute;
    inset-inline: 0;
    top: 100%;
    padding-block: var(--space-6) var(--space-5);
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--space-4);
  }
</style>
