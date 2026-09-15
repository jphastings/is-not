<script lang="ts">
  import { fly } from 'svelte/transition';
  import type { Part } from '@is-not/sentence';

  let { parts, animate = true }: { parts: Part[]; animate?: boolean } = $props();

  const stagger = 45;
  const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);
</script>

<span class="sentence">
  {#each parts as part, i (i)}
    {#if part.kind === 'text'}<span>{part.text}</span>{:else}<span
        class={part.kind}
        class:not={part.kind === 'adjective' && part.direction < 0}
        in:fly|global={{
          y: animate ? 14 : 0,
          duration: animate ? 420 : 160,
          delay: animate ? i * stagger : 0,
          easing: easeOutQuart,
        }}>{part.text}</span
      >{/if}
  {/each}
</span>

<style>
  .sentence {
    display: inline;
  }

  .sentence :global(span) {
    display: inline-block;
    white-space: pre-wrap;
  }

  .subject {
    color: var(--moss-deep);
  }

  .adjective {
    background: var(--moss-tint);
    border-radius: 0.15em;
    padding-inline: 0.12em;
  }

  /* "is not" carries the meaning; the underline only reinforces it. */
  .adjective.not {
    background: transparent;
    text-decoration: underline;
    text-decoration-color: var(--moss);
    text-decoration-thickness: 0.07em;
    text-underline-offset: 0.1em;
  }
</style>
