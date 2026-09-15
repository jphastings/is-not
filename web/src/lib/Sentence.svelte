<script lang="ts">
  import { fade } from 'svelte/transition';
  import type { Part } from '@is-not/sentence';

  let {
    parts,
    animate = true,
    linkWho = false,
  }: { parts: Part[]; animate?: boolean; linkWho?: boolean } = $props();

  const stagger = 45;
  const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);
</script>

<span class="sentence">
  {#each parts as part, i (i)}
    {#if part.kind === 'text'}<span>{part.text}</span>{:else if part.kind === 'subject'}<a
        href={`https://pdsls.dev/${part.uri}`}
        rel="noreferrer"
        class={part.kind}
        in:fade|global={{
          duration: animate ? 420 : 160,
          delay: animate ? i * stagger : 0,
          easing: easeOutQuart,
        }}>{part.text}</a
      >{:else if part.kind === 'who' && linkWho}<a
        href={`/reviews/${part.did}`}
        class={part.kind}
        in:fade|global={{
          duration: animate ? 420 : 160,
          delay: animate ? i * stagger : 0,
          easing: easeOutQuart,
        }}>{part.text}</a
      >{:else}<span
        class={part.kind}
        class:not={part.kind === 'adjective' && part.direction < 0}
        in:fade|global={{
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

  /* Plain inline boxes, not inline-block: a line full of atomic boxes cannot be
     balanced, and the parts arrive by fading, which inline boxes can do. */
  .sentence :global(span),
  .sentence :global(a) {
    display: inline;
    white-space: pre-wrap;
  }

  .subject {
    color: var(--moss-deep);
    text-decoration: none;
  }

  .subject:hover {
    text-decoration: underline;
  }

  /* One step lighter than .subject's moss-deep, so the reviewer reads as
     linked prose without competing with the subject for attention. */
  .who {
    color: var(--moss-handle);
    text-decoration: none;
  }

  .who:hover {
    text-decoration: underline;
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
