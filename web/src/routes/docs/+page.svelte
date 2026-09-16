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
      <ReviewForm
        demo
        accounts={data.accounts}
        current={data.current}
        serverError={null}
        saved={null}
        ondraft={(d) => (draft = d)}
      />
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
    align-items: center;
  }

  /* Centred in its cell: beside the JSON when there is room, above it when not. */
  .form-wrap {
    text-align: center;
    --sentence-size: var(--step-1);
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
