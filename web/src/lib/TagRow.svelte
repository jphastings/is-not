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

  let directionSelect: HTMLSelectElement | undefined = $state();

  function openDirection() {
    if (!directionSelect) return;
    // ponytail: showPicker() is missing/throws on some browsers (e.g. older Safari), fall back to focusing the select
    try {
      directionSelect.showPicker();
    } catch {
      directionSelect.focus();
    }
  }

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
    {#if tag.direction < 2}
      <button
        type="button"
        tabindex="-1"
        aria-hidden="true"
        class="chevron chevron-up"
        onclick={openDirection}
      >
        <svg viewBox="0 0 16 8" aria-hidden="true" focusable="false">
          <path d="M2 7 8 1 14 7" />
        </svg>
      </button>
    {/if}
    <select bind:this={directionSelect} bind:value={tag.direction} aria-label={m.dir_1()}>
      {#each directions as direction (direction.value)}
        <option value={direction.value}>{direction.label()}</option>
      {/each}
    </select>
    {#if tag.direction > -2}
      <button
        type="button"
        tabindex="-1"
        aria-hidden="true"
        class="chevron chevron-down"
        onclick={openDirection}
      >
        <svg viewBox="0 0 16 8" aria-hidden="true" focusable="false">
          <path d="M2 1 8 7 14 1" />
        </svg>
      </button>
    {/if}
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
  }

  /* Every part of the sentence is ruled on its own box, so they sit on one
     line however the part is built. The rule is a shadow, not a border, so
     thickening it on focus cannot change anyone's height. The direction
     field is a chooser, not a piece of text, so it gets chevrons instead of
     this underline. */
  .autosize.adjective {
    box-shadow: inset 0 -0.07em 0 var(--moss);
  }

  /* A box around a word would break the sentence, so focus thickens the rule. */
  li :is(textarea, select):focus-visible {
    outline: none;
  }

  .autosize.adjective:has(:focus-visible) {
    box-shadow: inset 0 -0.16em 0 var(--moss-deep);
  }

  /* Drawn rather than typed, like ClearButton's cross: positioned off the
     `.direction` box itself (already position:relative via .autosize) so
     appearing/disappearing can never resize or reflow the sentence. */
  .chevron {
    position: absolute;
    font: inherit;
    line-height: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 0.7em;
    height: 0.4em;
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;
  }

  .chevron-up {
    top: -0.3em;
  }

  .chevron-down {
    bottom: -0.25em;
  }

  .chevron svg {
    display: block;
    width: 100%;
    height: 100%;
    fill: none;
    stroke: var(--moss);
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .chevron:hover svg {
    stroke: var(--moss-deep);
  }

  .direction:has(:focus-visible) .chevron svg {
    stroke: var(--moss-deep);
    stroke-width: 2.75;
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
