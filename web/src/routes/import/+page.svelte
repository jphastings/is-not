<script lang="ts">
  import { m } from '$lib/paraglide/messages.js';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>{m.import_index_title()}</title>
</svelte:head>

<main>
  <h1 class="display">{m.import_index_heading()}</h1>
  <ul>
    {#each data.importers as importer (importer.domain)}
      <li class:muted={!importer.available}>
        <a href={`/import/${importer.domain}`}>{importer.domain}</a>
      </li>
    {/each}
  </ul>
</main>

<style>
  main {
    padding: var(--space-5);
    max-width: 60rem;
    margin-inline: auto;
    display: grid;
    gap: var(--space-5);
    padding-block: var(--space-6) var(--space-8);
  }

  h1 {
    font-size: var(--step-3);
    margin: 0;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--space-2);
  }

  li {
    font-size: var(--step-1);
    border-bottom: 1px solid var(--moss-tint);
    padding-block: var(--space-2);
  }

  li.muted a {
    color: var(--ink-soft);
  }

  a {
    color: inherit;
    text-decoration: underline;
    text-decoration-thickness: 0.07em;
    text-underline-offset: 0.15em;
  }
</style>
