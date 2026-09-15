<script lang="ts">
  let { label, onclick }: { label: string; onclick: () => void } = $props();
</script>

<button type="button" class="clear" aria-label={label} {onclick}>&times;</button>

<style>
  /* Absolutely positioned over its parent's own box (the parent must be
     position:relative — every `.autosize` field already is) so it can never
     change that box's size: appearing must not reflow the sentence. */
  .clear {
    position: absolute;
    top: -0.6em;
    right: -0.6em;
    width: 1.3em;
    height: 1.3em;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 50%;
    padding: 0;
    background: oklch(55% 0.21 25);
    color: white;
    font-size: 0.7em;
    line-height: 1;
    cursor: pointer;
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--dur-fast) var(--ease-out);
  }

  @media (prefers-color-scheme: dark) {
    .clear {
      background: oklch(68% 0.19 25);
    }
  }

  /* Hidden until hovered on desktop; always visible on touch, which has no
     hover to reveal it. Visible on keyboard focus either way. */
  :global(.autosize:hover) .clear,
  :global(.autosize:focus-within) .clear,
  .clear:focus-visible {
    opacity: 1;
    pointer-events: auto;
  }

  @media (hover: none) {
    .clear {
      opacity: 1;
      pointer-events: auto;
    }
  }
</style>
