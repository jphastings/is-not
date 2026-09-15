<script lang="ts">
  let { label, onclick }: { label: string; onclick: () => void } = $props();
</script>

<button type="button" class="clear" aria-label={label} {onclick}>
  <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path d="M5 5 11 11M11 5 5 11" />
  </svg>
</button>

<style>
  /* Absolutely positioned over its parent's own box (the parent must be
     position:relative — every `.autosize` field already is) so it can never
     change that box's size: appearing must not reflow the sentence. */
  .clear {
    position: absolute;
    top: -0.42em;
    right: -0.42em;
    width: 1.15em;
    height: 1.15em;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 50%;
    padding: 0;
    background: var(--moss);
    color: var(--paper);
    font-size: 0.62em;
    cursor: pointer;
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--dur-fast) var(--ease-out);
  }

  /* Drawn rather than typed: a cross glyph sits wherever its font puts it in
     the line box, which is never the middle of a circle. */
  .clear svg {
    width: 62%;
    height: 62%;
    fill: none;
    stroke: currentcolor;
    stroke-width: 2.25;
    stroke-linecap: round;
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
