<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';
  import type { Direction } from '@is-not/lenses';
  import { m } from '$lib/paraglide/messages.js';
  import ReviewRow from '$lib/ReviewRow.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const directionOrder: Direction[] = [2, 1, 0, -1, -2];
  const directionLabels: Record<Direction, () => string> = {
    2: m.dir_2,
    1: m.dir_1,
    0: m.dir_0,
    '-1': m.dir_m1,
    '-2': m.dir_m2,
  };

  // ponytail: client-side only, not in the URL — put it there if it ever needs sharing.
  let directions = $state(new SvelteSet<Direction>(directionOrder));
  const shown = $derived(data.reviews.filter((r) => r.tags.some((t) => directions.has(t.direction))));

  // Toggling a filter: clicking the active one clears it, everything else
  // preserves the other filter param.
  function href(next: { type?: string | null; adjective?: string | null }) {
    const type = next.type !== undefined ? next.type : data.filters.type;
    const adjective = next.adjective !== undefined ? next.adjective : data.filters.adjective;
    const params = new URLSearchParams();
    if (type) params.set('type', type);
    if (adjective) params.set('adjective', adjective);
    const qs = params.toString();
    return qs ? `?${qs}` : `/reviews/${data.id}`;
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
  <title>{m.reviews_title({ who: data.heading })}</title>
</svelte:head>

<main>
  <h1 class="display">{data.heading}</h1>

  {#if data.adjectives.length === 0}
    <p class="empty display">{m.reviews_empty()}</p>
  {:else}
    {#if !data.ofSubject}<nav class="types" aria-label={m.filter_types()}>
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
    </nav>{/if}

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

    <nav class="directions" aria-label={m.filter_directions()}>
      {#each directionOrder as d (d)}
        <label class="pill secondary small" class:active={directions.has(d)}>
          <input
            type="checkbox"
            class="sr-only"
            checked={directions.has(d)}
            onchange={() => (directions.has(d) ? directions.delete(d) : directions.add(d))}
          />
          {directionLabels[d]()}
        </label>
      {/each}
    </nav>

    {#if shown.length === 0}
      <p class="empty display">{m.reviews_empty()}</p>
    {:else}
      <ul class="reviews">
        {#each shown as review (review.rkey)}
          <ReviewRow {review} editable={review.did === data.viewer} who={data.ofSubject} />
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

  .types,
  .directions {
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

  /* One control, not five: the pills butt up against each other with a hairline
     of page between them, and only the group's outer corners are rounded. */
  .directions {
    gap: 1px;
  }

  .directions .pill {
    border-radius: 0;
  }

  .directions .pill:first-child {
    border-start-start-radius: var(--radius-pill);
    border-end-start-radius: var(--radius-pill);
  }

  .directions .pill:last-child {
    border-start-end-radius: var(--radius-pill);
    border-end-end-radius: var(--radius-pill);
  }

  .pill.small:focus-within {
    outline: 2px solid var(--moss);
    outline-offset: 2px;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
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
