<script lang="ts">
  import { m } from '$lib/paraglide/messages.js';

  const example = {
    $type: 'at.isnot.review',
    subject: {
      uri: 'at://did:plc:ephkzpinhaqcabtkugtbzrwu/buzz.bookhive.book/3mmodauih2s6w',
      cid: 'bafyreid2jgowfxzdnnsyz5ui7pjlgheorjs7sh6udummcl4mmhgsp5xery',
      title: 'Moon Over Brendle',
      type: 'book',
      identifiers: [{ key: 'isbn13', value: '9781836730309' }],
    },
    tags: [
      { direction: 1, adjective: 'gentle' },
      { direction: -2, adjective: 'a chore' },
    ],
    locale: 'en',
    createdAt: '2026-09-15T12:00:00.000Z',
    updatedAt: '2026-09-15T12:00:00.000Z',
  };
</script>

<svelte:head>
  <title>{m.docs_title()}</title>
</svelte:head>

<main>
  <h1 class="display">{m.docs()}</h1>
  <p class="intro">{m.docs_intro()}</p>

  <section>
    <h2 class="display">{m.docs_record_heading()}</h2>
    <p>{m.docs_record_note()}</p>
    <pre><code>{JSON.stringify(example, null, 2)}</code></pre>
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
    max-width: 44rem;
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

  .intro {
    font-size: var(--step-1);
    margin: 0;
    max-width: 30ch;
  }

  section p {
    margin: 0 0 var(--space-4);
    color: var(--ink-soft);
  }

  pre {
    margin: 0;
    padding: var(--space-4);
    background: var(--moss-tint);
    border-radius: 14px;
    overflow-x: auto;
    font-size: var(--step--1);
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
