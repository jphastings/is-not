<script lang="ts">
  import type { Subject } from '@is-not/lenses';
  import { m } from '$lib/paraglide/messages.js';
  import BrandIcon from '$lib/BrandIcon.svelte';
  import { identifierLinks } from '$lib/identifierLinks';

  let { subject }: { subject: Subject } = $props();
  const links = $derived(identifierLinks(subject));
</script>

{#if links.length > 0}
  <ul class="links" aria-label={m.subject_links()}>
    {#each links as link (link.href)}
      <li>
        <a href={link.href} rel="external" aria-label={m.open_on({ site: link.site })} title={m.open_on({ site: link.site })}>
          <BrandIcon brand={link.brand} />
        </a>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .links {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: var(--space-3);
  }

  a {
    display: block;
    padding: var(--space-1);
    color: var(--ink);
    line-height: 0;
    opacity: 0.85;
  }

  @media (hover: hover) {
    a:hover {
      opacity: 1;
    }
  }
</style>
