<script lang="ts">
  import type { Direction } from '@is-not/lenses';
  import { m } from '$lib/paraglide/messages.js';

  let {
    direction,
    mode,
    onrate,
  }: {
    direction: Direction | null;
    mode: 'thumbs' | 'stars';
    onrate: (direction: Direction | null) => void;
  } = $props();

  const directionLabels: Record<'2' | '1' | '0' | '-1' | '-2', () => string> = {
    2: m.dir_2,
    1: m.dir_1,
    0: m.dir_0,
    '-1': m.dir_m1,
    '-2': m.dir_m2,
  };
  const goodLabel = (dir: Direction) => `${directionLabels[dir]()} ${m.good_adjective()}`;

  // Filled glyphs (not strokes): the outline variants are hollow silhouettes
  // of the same shape, not the solid one drawn thin, so selecting a rating
  // swaps which `d` is drawn rather than toggling fill/stroke on one path.
  // The double-thumb outline already draws the front thumb occluding the
  // back one; no separate masking is needed here.
  const THUMB_UP =
    'M20.385 9q.627 0 1.12.494T22 10.616v1.23q0 .137-.028.298q-.028.162-.083.298l-2.731 6.474q-.206.461-.693.773q-.486.311-1.003.311H9.269q-.671 0-1.143-.472t-.472-1.144V9.672q0-.323.133-.628t.351-.522l5.156-5.112q.222-.215.494-.27t.516.059t.35.373q.108.258.04.579L13.665 9zM4.615 20q-.67 0-1.143-.472Q3 19.056 3 18.385v-7.77q0-.67.472-1.143Q3.944 9 4.616 9h.423q.67 0 1.143.472q.472.472.472 1.144v7.788q0 .671-.472 1.133Q5.71 20 5.039 20z';
  const THUMB_UP_OUTLINE =
    'M20.385 9q.627 0 1.12.494T22 10.616v1.23q0 .14-.03.3q-.032.16-.082.296l-2.731 6.476q-.205.459-.692.77q-.486.312-1.01.312H7.422V9l5.635-5.584q.22-.222.493-.275q.272-.053.516.082q.245.135.354.393q.11.257.043.54L13.434 9zm-11.962.427V19h9.039q.211 0 .432-.115q.222-.116.337-.385L21 12v-1.384q0-.27-.173-.443T20.385 10h-8.193l1.158-5.461zM4.616 20q-.667 0-1.141-.475T3 18.386v-7.77q0-.666.475-1.14T4.615 9h2.808v1H4.616q-.27 0-.443.173T4 10.616v7.769q0 .269.173.442t.443.173h2.807v1zm3.807-1V9.427z';
  const THUMB_DOWN =
    'M3.616 15q-.627 0-1.122-.494T2 13.385v-1.231q0-.137.028-.298q.028-.162.084-.298l2.73-6.473q.206-.462.693-.773Q6.02 4 6.538 4h8.192q.671 0 1.143.472t.472 1.143v8.714q0 .323-.133.628t-.351.522l-5.156 5.112q-.221.215-.493.27t-.517-.059t-.35-.373t-.04-.579l1.03-4.85zM19.385 4q.67 0 1.143.472q.472.472.472 1.144v7.769q0 .67-.472 1.143q-.472.472-1.143.472h-.423q-.671 0-1.144-.472t-.472-1.144V5.597q0-.671.472-1.133Q18.291 4 18.962 4z';
  const THUMB_DOWN_OUTLINE =
    'M3.616 15q-.627 0-1.122-.494T2 13.385v-1.231q0-.14.03-.3q.032-.16.082-.296l2.731-6.476q.205-.459.691-.77Q6.022 4 6.547 4h10.031v11l-5.635 5.585q-.22.22-.493.274q-.272.052-.516-.082q-.244-.135-.354-.392q-.11-.258-.042-.54L10.565 15zm11.961-.427V5H6.539q-.212 0-.433.116q-.221.115-.337.384L3 12v1.385q0 .269.173.442t.443.173h8.192l-1.158 5.462zM19.385 4q.666 0 1.14.475T21 5.615v7.77q0 .666-.475 1.14t-1.14.475h-2.808v-1h2.808q.269 0 .442-.173t.173-.442v-7.77q0-.269-.173-.442T19.385 5h-2.808V4zm-3.808 1v9.573z';
  const THUMBS_DOUBLE =
    'M18.87 16.192q-.391 0-.582-.3t-.05-.646l.11-.263q.494-1.118.417-2.18q-.078-1.06-.581-1.918q-.502-.857-1.407-1.37Q15.873 9 14.692 9H13.21q.106-.658 0-1.27q-.104-.613-.364-1.14q-.086-.176-.077-.369q.01-.192.147-.329l2.513-2.513q.165-.165.366-.165t.367.165l.017.017q.275.284.382.64q.108.355.058.733l-.388 2.808h4.153q.667 0 1.142.475T22 9.192v.37q0 .161-.04.322q-.04.162-.097.318l-2.382 5.589q-.085.191-.247.296t-.365.105M6.192 20q-.343 0-.575-.232t-.232-.576v-7.06q0-.322.12-.615t.34-.515l3.7-3.72q.203-.203.477-.207t.465.187q.292.292.353.614q.06.322.01.701l-.388 2.808h4.23q.455 0 .811.231t.574.618t.252.86t-.158.94L14 19.032q-.186.454-.59.711q-.404.258-.889.258zm-3.46 0q-.31 0-.521-.21T2 19.27v-7.154q0-.311.21-.521t.52-.21t.521.21t.21.52v7.154q0 .31-.21.521q-.21.21-.52.21';
  const THUMBS_DOUBLE_OUTLINE =
    'M16.23 7.577h4.155q.67 0 1.143.472q.472.472.472 1.143v.364q0 .161-.038.323q-.037.162-.093.304l-2.427 5.692q-.067.14-.18.229q-.112.088-.277.088q-.281 0-.424-.219t-.04-.488L21 9.67v-.479q0-.269-.173-.442t-.442-.173h-4.362q-.379 0-.618-.273q-.24-.273-.19-.646l.44-3.085q-.482.464-.942.924l-.944.944q-.146.146-.353.155q-.208.01-.354-.136t-.137-.357t.156-.357l2.354-2.373q.165-.165.363-.165t.364.165l.042.023q.273.273.382.624t.053.73zM2.809 20q-.348 0-.578-.23T2 19.192v-7q0-.348.23-.577q.23-.23.578-.23h2.961v1H3V19h2.77v1zm9.733 0H4.769v-7.923l4.781-4.8q.204-.204.479-.214t.46.175l.022.023q.274.273.344.605t.014.711l-.408 2.807h4.231q.671 0 1.143.473q.473.472.473 1.143v.389q0 .161-.038.31t-.093.31l-2.152 5.022q-.192.454-.596.711q-.404.258-.888.258m.403-1l2.364-5.496V13q0-.27-.174-.442q-.173-.173-.442-.173h-4.457q-.373 0-.616-.273t-.192-.646l.44-3.085l-4.098 4.117V19zM5.77 19v-7.534z';

  // A ten-point star (outer/inner radius alternating every 36°) filled solid
  // when selected; the outline is the same star with a smaller copy of
  // itself cut out (evenodd), a filled ring rather than a stroked line, so
  // it reads as the same kind of glyph as the thumbs above at this size.
  const STAR_SOLID =
    'M12,2 L14.23,8.93 L21.51,8.91 L15.61,13.17 L17.88,20.09 L12,15.8 L6.12,20.09 L8.39,13.17 L2.49,8.91 L9.77,8.93 Z';
  const STAR_OUTLINE = `${STAR_SOLID} M12,3.8 L13.83,9.48 L19.8,9.47 L14.96,12.96 L16.82,18.63 L12,15.12 L7.18,18.63 L9.04,12.96 L4.2,9.47 L10.17,9.48 Z`;

  const thumbSelected = $derived(
    direction === -2 || direction === -1 ? -1 : direction === 1 ? 1 : direction === 2 ? 2 : null,
  );
  function rateThumb(value: -1 | 1 | 2) {
    onrate(thumbSelected === value ? null : value);
  }

  // Direction n-3, so a direction maps back to the star it and everything
  // left of it lights up to: 1 star = -2, 5 stars = +2.
  const starIndex = $derived(direction === null ? 0 : direction + 3);
  function rateStar(n: number) {
    onrate(starIndex === n ? null : ((n - 3) as Direction));
  }
</script>

{#if mode === 'thumbs'}
  <div class="thumbs" role="group" aria-label={m.good_adjective()}>
    <button
      type="button"
      class="thumb"
      class:selected={thumbSelected === -1}
      aria-pressed={thumbSelected === -1}
      aria-label={goodLabel(-1)}
      onclick={() => rateThumb(-1)}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d={thumbSelected === -1 ? THUMB_DOWN : THUMB_DOWN_OUTLINE} />
      </svg>
    </button>
    <button
      type="button"
      class="thumb"
      class:selected={thumbSelected === 1}
      aria-pressed={thumbSelected === 1}
      aria-label={goodLabel(1)}
      onclick={() => rateThumb(1)}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d={thumbSelected === 1 ? THUMB_UP : THUMB_UP_OUTLINE} />
      </svg>
    </button>
    <button
      type="button"
      class="thumb"
      class:selected={thumbSelected === 2}
      aria-pressed={thumbSelected === 2}
      aria-label={goodLabel(2)}
      onclick={() => rateThumb(2)}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" class="double">
        <path d={thumbSelected === 2 ? THUMBS_DOUBLE : THUMBS_DOUBLE_OUTLINE} />
      </svg>
    </button>
  </div>
{:else}
  <div class="stars" role="group" aria-label={m.good_adjective()}>
    {#each [1, 2, 3, 4, 5] as n (n)}
      <button
        type="button"
        class="star"
        class:selected={starIndex >= n}
        aria-pressed={starIndex >= n}
        aria-label={goodLabel((n - 3) as Direction)}
        onclick={() => rateStar(n)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path fill-rule="evenodd" d={starIndex >= n ? STAR_SOLID : STAR_OUTLINE} />
        </svg>
      </button>
    {/each}
  </div>
{/if}

<style>
  .thumbs,
  .stars {
    display: inline-flex;
    gap: var(--space-3);
  }

  /* The double-thumb icon renders larger (below) than the other two, so the
     row stretches every button to that height (the flex default) and each
     button bottom-aligns its own icon within it: every glyph's cuff sits on
     the same baseline this way, whatever height its own svg box is. */
  .thumb,
  .star {
    display: inline-flex;
    justify-content: center;
    padding: var(--space-2);
    border: 0;
    background: none;
    color: var(--ink-soft);
    cursor: pointer;
    /* Gecko lays a button's content out on an inline line box of the
       inherited font, which sinks the svg well below where Chrome draws it. */
    line-height: 0;
  }

  .thumb {
    align-items: flex-end;
  }

  .star {
    align-items: center;
  }

  .thumb svg,
  .star svg {
    display: block;
    width: 1.75rem;
    height: 1.75rem;
  }

  /* The supplied double-thumb glyph's own front thumb is ~1.3x smaller
     within its 24-unit box than the single thumbs are in theirs, so scaling
     the rendered svg (not the path) by that factor brings the front thumb
     to the same size as the other two. Its back thumb pokes up and to the
     right of that; the button is left to size to its (now bigger) content,
     rather than cropping or shifting the glyph to force a neat box. */
  .thumb svg.double {
    width: calc(1.75rem * 1.3);
    height: calc(1.75rem * 1.3);
  }

  .thumb svg path,
  .star svg path {
    fill: currentColor;
  }

  .thumb.selected,
  .star.selected {
    color: var(--moss);
  }

  @media (hover: hover) {
    .thumb:hover,
    .star:hover {
      color: var(--moss-deep);
    }
  }
</style>
