<script lang="ts">
  import { m } from '$lib/paraglide/messages.js';
  import ReviewRow from '$lib/ReviewRow.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const who = $derived(data.handle || data.did);

  // Toggling a filter: clicking the active one clears it, everything else
  // preserves the other filter param.
  function href(next: { type?: string | null; adjective?: string | null }) {
    const type = next.type !== undefined ? next.type : data.filters.type;
    const adjective = next.adjective !== undefined ? next.adjective : data.filters.adjective;
    const params = new URLSearchParams();
    if (type) params.set('type', type);
    if (adjective) params.set('adjective', adjective);
    const qs = params.toString();
    return qs ? `?${qs}` : `/reviews/${data.did}`;
  }

  const minCount = $derived(Math.min(...data.adjectives.map((a) => a.count)));
  const maxCount = $derived(Math.max(...data.adjectives.map((a) => a.count)));
  function cloudSize(count: number) {
    if (maxCount === minCount) return '1rem';
    const t = (count - minCount) / (maxCount - minCount);
    return `${(1 + t * 1.3).toFixed(2)}rem`;
  }
</script>

<svelte:head>
  <title>{m.reviews_title({ who })}</title>
</svelte:head>

<main>
  <h1 class="display">@{who}</h1>

  {#if data.adjectives.length === 0}
    <p class="empty display">{m.reviews_empty()}</p>
  {:else}
    <nav class="types" aria-label={m.filter_types()}>
      <a class="pill secondary small" class:active={!data.filters.type} href={href({ type: null })}>
        {m.filter_all()}
      </a>
      {#each data.types as type (type)}
        <a
          class="pill secondary small"
          class:active={data.filters.type === type}
          href={href({ type: data.filters.type === type ? null : type })}
        >
          {type.replaceAll('-', ' ')}
        </a>
      {/each}
    </nav>

    <ul class="cloud" aria-label={m.filter_adjectives()}>
      {#each data.adjectives as { adjective, count } (adjective)}
        <li>
          <a
            class:active={data.filters.adjective === adjective}
            style:font-size={cloudSize(count)}
            href={href({ adjective: data.filters.adjective === adjective ? null : adjective })}
          >
            {adjective}
          </a>
        </li>
      {/each}
    </ul>

    {#if data.reviews.length === 0}
      <p class="empty display">{m.reviews_empty()}</p>
    {:else}
      <ul class="reviews">
        {#each data.reviews as review (review.rkey)}
          <ReviewRow {review} editable={data.editable} />
        {/each}
      </ul>
    {/if}
  {/if}
</main>

<style>
  main {
    padding: var(--space-5);
    max-width: 40rem;
    margin-inline: auto;
  }

  h1 {
    font-size: var(--step-3);
    margin: 0 0 var(--space-5);
    overflow-wrap: anywhere;
  }

  .empty {
    font-size: var(--step-2);
    color: var(--ink-soft);
    text-align: center;
    margin: var(--space-7) 0;
  }

  .types {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }

  .pill.small {
    padding: var(--space-1) var(--space-4);
    font-size: var(--step--1);
  }

  .pill.active {
    background: var(--moss);
    color: var(--paper);
  }

  .cloud {
    list-style: none;
    margin: 0 0 var(--space-6);
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-2) var(--space-4);
  }

  .cloud a {
    color: var(--moss-deep);
    text-decoration: none;
    font-family: var(--font-display);
    font-weight: 700;
    line-height: 1;
  }

  .cloud a:hover,
  .cloud a.active {
    text-decoration: underline;
  }

  .cloud a.active {
    color: var(--ink);
  }

  .reviews {
    list-style: none;
    margin: 0;
    padding: 0;
  }
</style>
