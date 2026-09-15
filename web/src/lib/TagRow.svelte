<script lang="ts">
  import type { Tag } from '@is-not/lenses';
  import { m } from '$lib/paraglide/messages.js';

  let {
    tag,
    onRemove,
    showComma = false,
  }: {
    tag: Tag;
    onRemove?: () => void;
    showComma?: boolean;
  } = $props();

  const directions = [
    { value: 2, label: () => m.dir_2() },
    { value: 1, label: () => m.dir_1() },
    { value: 0, label: () => m.dir_0() },
    { value: -1, label: () => m.dir_m1() },
    { value: -2, label: () => m.dir_m2() },
  ];

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
      placeholder={m.adjective_placeholder()}
      aria-label={m.adjective_placeholder()}
    ></textarea>
  </span>
  {#if showComma}<span class="comma">,</span>{/if}
  {#if onRemove}
    <button type="button" class="plain remove" aria-label={m.remove()} onclick={onRemove}>
      &times;
    </button>
  {/if}
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
  }

  /* The hidden twin alone sets the box: a form control's intrinsic height and
     width differ per browser (Firefox sizes inputs taller than the same text),
     which would tilt the rules out of line. */
  .autosize::after {
    content: attr(data-value) ' ';
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
     thickening it on focus cannot change anyone's height. */
  .autosize {
    box-shadow: inset 0 -0.07em 0 var(--moss);
  }

  /* A box around a word would break the sentence, so focus thickens the rule. */
  li :is(textarea, select):focus-visible {
    outline: none;
  }

  .autosize:has(:focus-visible) {
    box-shadow: inset 0 -0.16em 0 var(--moss-deep);
  }

  .comma {
    margin-inline-start: -0.25em;
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

  .remove {
    font-size: var(--step-1);
    line-height: 1;
    color: var(--ink-soft);
    text-decoration: none;
    padding-inline: 0.15em;
    align-self: center;
  }

  .remove:hover {
    color: var(--ink);
  }
</style>
