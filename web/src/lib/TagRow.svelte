<script lang="ts">
  import type { Tag } from '@is-not/lenses';
  import { m } from '$lib/paraglide/messages.js';
  import ClearButton from '$lib/ClearButton.svelte';

  let {
    tag,
    onRemove,
    separator = null,
  }: {
    tag: Tag;
    onRemove?: () => void;
    /** What joins this tag to the next: a comma, or the final "and". */
    separator?: 'comma' | 'and' | null;
  } = $props();

  const directions = [
    { value: 2, label: () => m.dir_2() },
    { value: 1, label: () => m.dir_1() },
    { value: 0, label: () => m.dir_0() },
    { value: -1, label: () => m.dir_m1() },
    { value: -2, label: () => m.dir_m2() },
  ];

  // The clear button only earns its place once the adjective is done, not
  // while it's still being typed: blurred and non-empty. A tag that arrives
  // filled in (an existing review being edited) is already done.
  // svelte-ignore state_referenced_locally
  let touched = $state(tag.adjective.trim() !== '');
  const complete = $derived(touched && tag.adjective.trim() !== '');

  // The fields are textareas so long adjectives wrap with the sentence, but a
  // review is one line: Enter submits rather than breaking it.
  function oneLine(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      (event.currentTarget as HTMLElement).closest('form')?.requestSubmit();
    }
  }
</script>

<li>
  <span
    class="autosize direction"
    data-value={directions.find((d) => d.value === tag.direction)?.label()}
  >
    <select bind:value={tag.direction} aria-label={m.dir_1()}>
      {#each directions as direction (direction.value)}
        <option value={direction.value}>{direction.label()}</option>
      {/each}
    </select>
  </span>
  <span class="autosize adjective" data-value={tag.adjective || m.adjective_placeholder()}>
    <textarea
      bind:value={tag.adjective}
      rows="1"
      onkeydown={oneLine}
      onfocus={() => (touched = false)}
      onblur={() => (touched = true)}
      placeholder={m.adjective_placeholder()}
      aria-label={m.adjective_placeholder()}
    ></textarea>
    {#if complete && onRemove}
      <ClearButton label={m.remove()} onclick={onRemove} />
    {/if}
  </span>{#if separator === 'comma'}<span class="comma">,</span>{' '}{/if}
  {#if separator === 'and'}{' '}<span class="conj">{m.and()}</span>{' '}{/if}
</li>

<style>
  li {
    display: inline;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  /* Inputs grow with what is typed: the ::after twin sets the width. */
  .autosize {
    display: inline-grid;
    max-width: 100%;
    position: relative;
    vertical-align: baseline;
  }

  .autosize::after,
  .autosize textarea,
  .autosize select {
    grid-area: 1 / 1;
    font: inherit;
    letter-spacing: inherit;
  }

  /* The hidden twin alone sets the box: a form control's intrinsic height and
     width differ per browser (Firefox sizes inputs taller than the same text),
     which would tilt the rules out of line. */
  .autosize::after {
    /* A zero-width space, not a real one: the twin must never be an empty box
       (it alone sets the height), but a trailing space would widen it and the
       rule would run on past the word. */
    content: attr(data-value) '\200b';
    visibility: hidden;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .autosize textarea,
  .autosize select {
    position: absolute;
    inset: 0;
    width: 100%;
    min-width: 0;
  }

  .autosize textarea {
    resize: none;
    overflow: hidden;
    text-align: inherit;
  }

  textarea,
  select {
    font: inherit;
    letter-spacing: inherit;
    color: inherit;
    background: none;
    border: 0;
    padding: 0;
  }

  textarea::placeholder {
    color: var(--ink-soft);
    opacity: 0.7;
  }

  select {
    appearance: none;
    cursor: pointer;
    color: var(--direction-ink);
  }

  .adjective textarea {
    color: var(--adjective-ink);
  }

  .comma,
  .conj {
    color: var(--ink-soft);
  }

  /* Keyboard focus needs its own visible indicator now nothing else marks the
     field: an underline, not the default outline, which would draw a box
     around a word and break the sentence. */
  li :is(textarea, select):focus-visible {
    outline: none;
    text-decoration: underline;
    text-decoration-color: currentColor;
    text-decoration-thickness: 0.08em;
    text-underline-offset: 0.15em;
  }

  /* Glued to the adjective's box — no whitespace before it in the markup — so a
     wrapped line can never start with the comma. */
  .comma {
    margin: 0;
  }

  /* `font: inherit` carries the font shorthand's own line-height, not the one
     the sentence cascades, so a field's box was the font's line-height while
     the words beside it are as tall as the font's real metrics: every field
     rode ~9px high, and a wrapped line staggered. `normal` is those metrics.
     Last in the sheet because every `font` shorthand above resets it. */
  .autosize::after,
  .autosize textarea,
  .autosize select {
    line-height: normal;
  }
</style>
