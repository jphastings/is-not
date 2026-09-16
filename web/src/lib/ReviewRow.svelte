<script module lang="ts">
  // The one row whose adornments (chevrons, ×, "and?") a touch screen shows:
  // the last one tapped. Shared across rows so tapping one clears the rest.
  let adorned = $state<string | null>(null);
</script>

<script lang="ts">
  import { enhance } from '$app/forms';
  import { reviewSentence } from '@is-not/sentence';
  import type { Tag } from '@is-not/lenses';
  import { m } from '$lib/paraglide/messages.js';
  import Sentence from '$lib/Sentence.svelte';
  import TagRow from '$lib/TagRow.svelte';
  import type { ListedReview } from '$lib/server/db';

  let {
    review,
    editable,
    who = false,
  }: {
    review: ListedReview;
    editable: boolean;
    /** Name the reviewer in the sentence — for pages not already about them. */
    who?: boolean;
  } = $props();

  // Deliberate one-time snapshot: an editable draft the user works on locally
  // until they save, not a live mirror of the loaded review.
  // svelte-ignore state_referenced_locally
  const prefilled = review.tags.map((t) => t.adjective);
  // svelte-ignore state_referenced_locally
  let tags = $state<Tag[]>(review.tags.map((t) => ({ ...t })));
  let sending = $state(false);
  let deleteForm = $state<HTMLFormElement>();

  const parts = $derived(
    reviewSentence(
      { subject: review.subject, tags: review.tags, locale: review.locale },
      who ? { who: { handle: review.handle || review.did, did: review.did } } : {},
    ),
  );

  const payload = $derived(
    JSON.stringify({
      subject: review.subject,
      tags: tags.filter((t) => t.adjective.trim() !== ''),
      locale: review.locale,
      prefilled,
    }),
  );

  const dirty = $derived(
    tags.length !== review.tags.length ||
      tags.some(
        (t, i) =>
          t.adjective !== review.tags[i]?.adjective || t.direction !== review.tags[i]?.direction,
      ),
  );
  const saveable = $derived(dirty && tags.some((t) => t.adjective.trim() !== ''));

  // A row can never be saved with zero tags (the lexicon requires at least
  // one), so removing the only one deletes the record instead of a save.
  function removeTag(i: number) {
    if (tags.length === 1) {
      if (confirm(m.confirm_delete())) deleteForm?.requestSubmit();
      return;
    }
    tags = tags.filter((_, n) => n !== i);
  }
</script>

<li
  class="review"
  class:adorned={adorned === `${review.did}/${review.rkey}`}
  onpointerdown={() => (adorned = `${review.did}/${review.rkey}`)}
>
  <div class="row">
    {#if editable}
      <a class="subject" href={`https://pdsls.dev/${review.subject.uri}`} rel="noreferrer">
        {review.subject.title}
      </a>
      <form
        class="tags-form"
        method="POST"
        action="/review?/save"
        use:enhance={() => {
          sending = true;
          return async ({ update }) => {
            sending = false;
            await update({ reset: false });
          };
        }}
      >
        <input type="hidden" name="review" value={payload} />
        <ul class="tags">
          {#each tags as tag, i (i)}
            <TagRow
              {tag}
              separator={i >= tags.length - 1 ? null : i === tags.length - 2 ? 'and' : 'comma'}
              onRemove={() => removeTag(i)}
            />
          {/each}
        </ul>
        <button
          type="button"
          class="plain and"
          onclick={() => (tags = [...tags, { direction: 1, adjective: '' }])}
        >
          {m.add_another()}
        </button>
        {#if saveable}
          <button class="pill small" disabled={sending}>{m.update()}</button>
        {/if}
      </form>
      <form bind:this={deleteForm} method="POST" action="?/delete" use:enhance hidden>
        <input type="hidden" name="rkey" value={review.rkey} />
      </form>
    {:else}
      <span class="sentence"><Sentence {parts} animate={false} linkWho /></span>
    {/if}
  </div>
  <span class="type">{review.subject.type.replaceAll('-', ' ')}</span>
</li>

<style>
  .review {
    list-style: none;
    padding-block: var(--space-3);
    border-bottom: 1px solid var(--moss-tint);
  }

  .row {
    font-size: var(--step-1);
    line-height: 1.85;
  }

  .subject {
    font-family: var(--font-display);
    font-weight: 700;
    color: var(--moss-deep);
    text-decoration: none;
  }

  .subject:hover {
    text-decoration: underline;
  }

  .type {
    display: block;
    font-size: var(--step--1);
    color: var(--ink-soft);
    margin-top: var(--space-1);
  }

  .tags-form {
    display: inline;
  }

  .tags {
    display: inline;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .plain {
    font: inherit;
    color: var(--moss-deep);
    background: none;
    border: 0;
    padding: 0;
    cursor: pointer;
    text-decoration: underline;
  }

  /* An input prompt, not part of the sentence: hidden until the row is hovered
     on desktop (ClearButton's idiom), always visible on touch, which has no
     hover to reveal it. Opacity, not display, so revealing never reflows. */
  .and {
    color: var(--ink-soft);
    text-decoration: none;
    margin-inline-start: var(--space-2);
    opacity: 0;
    transition: opacity var(--dur-fast) var(--ease-out);
  }

  .review:hover .and,
  .review:focus-within .and,
  .and:focus-visible {
    opacity: 1;
  }

  /* No hover to reveal it on touch, so it shows on the row last tapped only:
     every row's adornments at once is clutter. */
  @media (hover: none) {
    .review.adorned .and {
      opacity: 1;
    }
  }

  .pill.small {
    margin-inline-start: var(--space-3);
    padding: var(--space-1) var(--space-4);
    font-size: var(--step--1);
  }
</style>
