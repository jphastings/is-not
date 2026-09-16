<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';
  import type { Direction } from '@is-not/lenses';
  import { page } from '$app/state';
  import { pushState } from '$app/navigation';
  import { resolveSubject } from '$lib/lenses';
  import { m } from '$lib/paraglide/messages.js';
  import ReviewRow from '$lib/ReviewRow.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const type = $derived(page.url.searchParams.get('type'));
  const adjective = $derived(page.url.searchParams.get('adjective'));

  // A subject with no reviews has no title on the server, and lenses only load in
  // the browser, so resolve it here.
  let resolved: { title: string; type: string } | undefined = $state();
  let failed = $state(false);
  $effect(() => {
    resolved = undefined;
    failed = false;
    if (data.heading !== null) return;
    const uri = data.id;
    resolveSubject(uri).then(
      (r) => {
        if (uri !== data.id) return;
        if ('error' in r) failed = true;
        else resolved = { title: r.subject.title, type: r.subject.type };
      },
      () => {
        if (uri === data.id) failed = true;
      },
    );
  });
  const unresolved = $derived(data.heading === null && !resolved);
  const heading = $derived(
    resolved?.title ?? data.heading ?? (failed ? m.subject_unknown() : m.subject_finding()),
  );
  const subjectType = $derived(resolved?.type ?? data.subjectType);

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
  const shown = $derived(
    data.reviews.filter(
      (r) =>
        r.tags.some((t) => directions.has(t.direction)) &&
        (!type || r.subject.type === type) &&
        (!adjective || r.tags.some((t) => t.adjective === adjective)),
    ),
  );

  // Toggling a filter: clicking the active one clears it, everything else
  // preserves the other filter param.
  function href(next: { type?: string | null; adjective?: string | null }) {
    const t = next.type !== undefined ? next.type : type;
    const a = next.adjective !== undefined ? next.adjective : adjective;
    const params = new URLSearchParams();
    if (t) params.set('type', t);
    if (a) params.set('adjective', a);
    const qs = params.toString();
    return qs ? `?${qs}` : `/reviews/${data.id}`;
  }

  // Left-click on a filter link goes shallow (URL + page.url update, no
  // load re-run); modified clicks (new tab, etc.) keep native behaviour.
  function shallow(event: MouseEvent) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    pushState((event.currentTarget as HTMLAnchorElement).href, {});
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
  <title>{m.reviews_title({ who: heading })}</title>
</svelte:head>

<main>
  <h1 class="display" class:unresolved>
    {heading}
    {#if subjectType}<small>({subjectType.replaceAll('-', ' ')})</small>{/if}
  </h1>

  {#if data.adjectives.length === 0}
    <p class="empty display">{m.reviews_empty()}</p>
    {#if data.ofSubject}
      <p class="empty-action">
        <a class="pill" href={`/review?subject=${encodeURIComponent(data.id)}`}>{m.add_a_review()}</a>
      </p>
    {/if}
  {:else}
    {#if !data.ofSubject}<nav class="types" aria-label={m.filter_types()}>
      <a class="pill secondary small" class:active={!type} href={href({ type: null })} onclick={shallow}>
        {m.filter_all()}
      </a>
      {#each data.types as t (t)}
        <a
          class="pill secondary small"
          class:active={type === t}
          href={href({ type: type === t ? null : t })}
          onclick={shallow}
        >
          {t.replaceAll('-', ' ')}
        </a>
      {/each}
    </nav>{/if}

    <ul class="cloud" aria-label={m.filter_adjectives()}>
      {#each data.adjectives as { adjective: a, count } (a)}
        <li>
          <a
            class:active={adjective === a}
            style:font-size={cloudSize(count)}
            href={href({ adjective: adjective === a ? null : a })}
            onclick={shallow}
          >
            {a}
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
          <ReviewRow {review} editable={review.did === data.viewer} who={data.ofSubject} showType={!data.ofSubject} />
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

  h1.unresolved {
    color: var(--ink-soft);
  }

  h1 small {
    font-family: var(--font-body);
    font-size: var(--step--1);
    font-weight: 400;
    letter-spacing: normal;
    color: var(--ink-soft);
    white-space: nowrap;
  }

  .empty {
    font-size: var(--step-2);
    color: var(--ink-soft);
    text-align: center;
    margin: var(--space-7) 0;
  }

  .empty-action {
    text-align: center;
    margin: 0 0 var(--space-7);
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
