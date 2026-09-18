<script lang="ts">
  import type { Subject, Tag } from '@is-not/lenses';
  import { m } from '$lib/paraglide/messages.js';
  import ReviewForm from '$lib/ReviewForm.svelte';
  import JsonPreview, { MISSING, MISSING_OBJECT } from '$lib/JsonPreview.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  // One timestamp, captured once, so editing the demo doesn't re-highlight
  // createdAt/updatedAt on every keystroke.
  const timestamp = new Date().toISOString();

  let draft = $state<{ subject: Subject | null; tags: Tag[]; locale: string } | null>(null);
  let view = $state<'adjectives' | 'thumbs' | 'stars'>('adjectives');

  const record = $derived({
    $type: 'at.isnot.review',
    subject: draft?.subject ?? MISSING_OBJECT,
    // A blank adjective is shown as ??? rather than "": the record can't be saved with it.
    tags: (draft?.tags ?? [{ direction: 1, adjective: '' }]).map((t) => ({
      direction: t.direction,
      adjective: t.adjective.trim() === '' ? MISSING : t.adjective,
    })),
    ...(draft?.locale ? { locale: draft.locale } : {}),
    createdAt: timestamp,
    updatedAt: timestamp,
  });
</script>

<svelte:head>
  <title>{m.docs_title()}</title>
  <meta property="og:title" content={m.docs_title()} />
</svelte:head>

<main>
  <h1 class="display">{m.docs()}</h1>

  <!-- Our own copy, not user content: {@html} is safe here. -->
  <p>{@html m.docs_p1()}</p>
  <p>{@html m.docs_p2()}</p>
  <p>{@html m.docs_p3()}</p>
  <p>{@html m.docs_p4()}</p>

  <section class="demo">
    <div class="form-wrap">
      <fieldset class="view-picker">
        <legend class="visually-hidden">{m.demo_view_legend()}</legend>
        <input
          type="radio"
          id="view-thumbs"
          class="visually-hidden"
          name="demo-view"
          value="thumbs"
          bind:group={view}
        />
        <label for="view-thumbs">{m.demo_view_thumbs()}</label>
        <input
          type="radio"
          id="view-stars"
          class="visually-hidden"
          name="demo-view"
          value="stars"
          bind:group={view}
        />
        <label for="view-stars">{m.demo_view_stars()}</label>
        <input
          type="radio"
          id="view-adjectives"
          class="visually-hidden"
          name="demo-view"
          value="adjectives"
          bind:group={view}
        />
        <label for="view-adjectives">{m.demo_view_adjectives()}</label>
      </fieldset>

      <div class="form-area">
        <ReviewForm
          demo
          {view}
          initialSubject={data.initialSubject}
          accounts={data.accounts}
          current={data.current}
          serverError={null}
          saved={null}
          removed={false}
          ondraft={(d) => (draft = d)}
        />
      </div>
    </div>
    <JsonPreview value={record} />
  </section>

  <section>
    <h2 class="display">{m.docs_use_heading()}</h2>
    <ul>
      <li>{m.docs_use_read()}</li>
      <li>{m.docs_use_write()}</li>
      <li>{m.docs_use_show()}</li>
    </ul>
  </section>

  <section>
    <h2 class="display">{m.docs_technical_heading()}</h2>
    <p>{m.docs_technical_merge()}</p>
  </section>

  <section>
    <h2 class="display">{m.docs_links_heading()}</h2>
    <ul class="links">
      <li>
        <a href="https://github.com/jphastings/is-not/blob/main/lexicons/at/isnot/review.json"
          >{m.docs_link_lexicon()}</a
        >
      </li>
      <li><a href="https://www.npmjs.com/package/@is-not/lenses">{m.docs_link_lenses()}</a></li>
      <li><a href="https://www.npmjs.com/package/@is-not/sentence">{m.docs_link_sentence()}</a></li>
      <li><a href="https://github.com/jphastings/is-not">{m.docs_link_source()}</a></li>
    </ul>
  </section>
</main>

<style>
  main {
    padding: var(--space-5);
    max-width: 60rem;
    margin-inline: auto;
    display: grid;
    gap: var(--space-6);
    padding-block: var(--space-6) var(--space-8);
  }

  h1 {
    font-size: var(--step-4);
    margin: 0;
  }

  h2 {
    font-size: var(--step-2);
    margin: 0 0 var(--space-3);
  }

  main > p {
    font-size: var(--step-1);
    margin: 0;
    max-width: 60ch;
  }

  .demo {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
    gap: var(--space-5);
    /* Stretches the left pane to the JSON's own height (grid's default),
       rather than centring a shorter pane against it, so the tab bar can
       pin to the pane's top edge — flush with the JSON box's top edge —
       and the form gets the rest of the height to centre in. */
    align-items: stretch;
  }

  /* Beside the JSON when there is room, above it when not; a column so the
     tab bar sits at its top (flush with the JSON's top) and the form takes
     the rest of the height, centred within it. */
  .form-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: var(--space-6);
    --sentence-size: var(--step-1);
  }

  .form-area {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: 12rem;
    padding-block: var(--space-6);
  }

  /* Kept in normal flow (not `position: absolute`) rather than the usual
     off-screen trick: on the radio inputs, that keeps each one's hit target
     next to its own label instead of stacking all three wherever the
     nearest positioned ancestor happens to put them. A fieldset excludes
     its <legend> from layout as a flex/grid item either way. */
  .visually-hidden {
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }

  .view-picker {
    display: inline-flex;
    flex: none;
    margin: 0;
    padding: 0;
    border: 0;
  }

  .view-picker label {
    padding: var(--space-2) var(--space-4);
    font-family: var(--font-display);
    font-weight: 700;
    font-size: var(--step--1);
    color: var(--moss-deep);
    background: var(--moss-tint);
    cursor: pointer;
  }

  .view-picker label:first-of-type {
    border-start-start-radius: var(--radius-pill);
    border-end-start-radius: var(--radius-pill);
  }

  .view-picker label:last-of-type {
    border-start-end-radius: var(--radius-pill);
    border-end-end-radius: var(--radius-pill);
  }

  .view-picker input:checked + label {
    background: var(--moss);
    color: var(--paper);
  }

  @media (hover: hover) {
    .view-picker label:hover {
      background: var(--moss);
      color: var(--paper);
    }
  }

  .view-picker input:focus-visible + label {
    outline: 3px solid var(--moss);
    outline-offset: 2px;
    position: relative;
    z-index: 1;
  }

  ul {
    margin: 0;
    padding-left: 1.2em;
    display: grid;
    gap: var(--space-3);
  }

  .links {
    list-style: none;
    padding: 0;
  }

  a {
    color: var(--moss-deep);
  }
</style>
