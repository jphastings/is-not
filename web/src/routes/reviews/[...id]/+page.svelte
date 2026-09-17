<script lang="ts">
  import type { Direction } from '@is-not/lenses';
  import { page } from '$app/state';
  import { resolveSubject } from '$lib/lenses';
  import { m } from '$lib/paraglide/messages.js';
  import ReviewRow from '$lib/ReviewRow.svelte';
  import SingleReview from '$lib/SingleReview.svelte';
  import SubjectLinks from '$lib/SubjectLinks.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  // Only the listing branch needs the subject and filtering state below; a single review
  // (data.single) renders SingleReview instead.
  const listing = $derived(data.single ? null : data);

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
  const subjectType = $derived(resolved?.type ?? listing?.subjectType ?? null);

  const directionOrder: Direction[] = [2, 1, 0, -1, -2];
  const directionLabels: Record<Direction, () => string> = {
    2: m.dir_2,
    1: m.dir_1,
    0: m.dir_0,
    '-1': m.dir_m1,
    '-2': m.dir_m2,
  };

  type Filters = { type: string | null; adjective: string | null; directions: Direction[] };

  // Every filter/pagination link is an ordinary navigation carrying the whole
  // filter state in its query string, so the server load re-runs scoped to it.
  function buildHref(filters: Filters, cursor?: string | null) {
    const params = new URLSearchParams();
    if (filters.type) params.set('type', filters.type);
    if (filters.adjective) params.set('adjective', filters.adjective);
    if (filters.directions.length < directionOrder.length) {
      for (const d of directionOrder) if (filters.directions.includes(d)) params.append('direction', String(d));
    }
    if (cursor) params.set('cursor', cursor);
    const qs = params.toString();
    return qs ? `${page.url.pathname}?${qs}` : page.url.pathname;
  }

  function typeHref(t: string | null) {
    return buildHref({ ...listing!.filters, type: t });
  }
  function adjectiveHref(a: string | null) {
    return buildHref({ ...listing!.filters, adjective: a });
  }
  function directionHref(d: Direction) {
    const current = listing!.filters.directions;
    const has = current.includes(d);
    // Never lands on an empty set: the query string can't tell "no directions"
    // from "no filter", so toggling off the last one just clears the filter.
    const next = has ? current.filter((x) => x !== d) : [...current, d];
    return buildHref({ ...listing!.filters, directions: next.length ? next : directionOrder });
  }
  const nextHref = $derived(
    listing?.nextCursor ? buildHref(listing.filters, listing.nextCursor) : null,
  );
  const firstPageHref = $derived(listing ? buildHref(listing.filters) : '');

  const minCount = $derived(Math.min(...(listing?.adjectives ?? []).map((a) => a.count)));
  const maxCount = $derived(Math.max(...(listing?.adjectives ?? []).map((a) => a.count)));
  function cloudSize(count: number) {
    if (maxCount === minCount) return '1rem';
    const t = (count - minCount) / (maxCount - minCount);
    return `${(1 + t * 1.3).toFixed(2)}rem`;
  }
</script>

<svelte:head>
  <title>{m.reviews_title({ who: heading })}</title>
  <meta property="og:title" content={m.reviews_title({ who: heading })} />
</svelte:head>

{#if data.single}
  <SingleReview {heading} review={data.review} />
{:else if listing}
  <main>
    <h1 class="display" class:unresolved>
      {heading}
      {#if subjectType}<small>({subjectType.replaceAll('-', ' ')})</small>{/if}
    </h1>
    {#if listing.subject}<div class="subject-links"><SubjectLinks subject={listing.subject} /></div>{/if}

    {#if listing.adjectives.length === 0}
      <p class="empty display">{m.reviews_empty()}</p>
      {#if listing.ofSubject}
        <p class="empty-action">
          <a class="pill" href={`/review?subject=${encodeURIComponent(listing.id)}`}>{m.add_a_review()}</a>
        </p>
      {/if}
    {:else}
      {#if !listing.ofSubject}<nav class="types" aria-label={m.filter_types()}>
        <a
          class="pill secondary small"
          class:active={!listing.filters.type}
          href={typeHref(null)}
          data-sveltekit-noscroll
          data-sveltekit-keepfocus
        >
          {m.filter_all()}
        </a>
        {#each listing.types as t (t)}
          <a
            class="pill secondary small"
            class:active={listing.filters.type === t}
            href={typeHref(listing.filters.type === t ? null : t)}
            data-sveltekit-noscroll
            data-sveltekit-keepfocus
          >
            {t.replaceAll('-', ' ')}
          </a>
        {/each}
      </nav>{/if}

      <ul class="cloud" aria-label={m.filter_adjectives()}>
        {#each listing.adjectives as { adjective: a, count } (a)}
          <li>
            <a
              class:active={listing.filters.adjective === a}
              style:font-size={cloudSize(count)}
              href={adjectiveHref(listing.filters.adjective === a ? null : a)}
              data-sveltekit-noscroll
              data-sveltekit-keepfocus
            >
              {a}
            </a>
          </li>
        {/each}
      </ul>

      <nav class="directions" aria-label={m.filter_directions()}>
        {#each directionOrder as d (d)}
          <a
            class="pill secondary small"
            class:active={listing.filters.directions.includes(d)}
            href={directionHref(d)}
            data-sveltekit-noscroll
            data-sveltekit-keepfocus
          >
            {directionLabels[d]()}
          </a>
        {/each}
      </nav>

      {#if listing.reviews.length === 0}
        <p class="empty display">{m.reviews_empty()}</p>
      {:else}
        <ul class="reviews">
          {#each listing.reviews as review (review.rkey)}
            <ReviewRow
              {review}
              editable={review.did === listing.viewer}
              who={listing.showWho}
              showType={listing.showType}
            />
          {/each}
        </ul>
        {#if listing.cursor || nextHref}
          <nav class="pager" aria-label={m.pager_label()}>
            {#if listing.cursor}
              <a class="pill secondary small" href={firstPageHref}>{m.pager_first()}</a>
            {/if}
            {#if nextHref}
              <a class="pill secondary small" href={nextHref} data-sveltekit-noscroll>{m.pager_next()}</a>
            {/if}
          </nav>
        {/if}
      {/if}
    {/if}
  </main>
{/if}

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

  .subject-links {
    display: flex;
    justify-content: center;
    margin-block: calc(-1 * var(--space-3)) var(--space-5);
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
  .directions,
  .pager {
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

  /* Tighter than other small pills so all five fit one line on a phone. */
  .directions .pill {
    border-radius: 0;
    padding-inline: var(--space-3);
  }

  .directions .pill:first-child {
    border-start-start-radius: var(--radius-pill);
    border-end-start-radius: var(--radius-pill);
  }

  .directions .pill:last-child {
    border-start-end-radius: var(--radius-pill);
    border-end-end-radius: var(--radius-pill);
  }

  .pill.small:focus-visible {
    outline: 2px solid var(--moss);
    outline-offset: 2px;
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

  .pager {
    margin-top: var(--space-5);
    margin-bottom: 0;
  }
</style>
