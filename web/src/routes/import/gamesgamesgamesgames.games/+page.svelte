<script lang="ts">
  import type { Tag } from '@is-not/lenses';
  import { m } from '$lib/paraglide/messages.js';
  import ImportPage from '$lib/ImportPage.svelte';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const domain = 'gamesgamesgamesgames.games';
  const sources = [{ key: 'like', label: m.import_source_like() }];
  const defaults: Record<string, Tag> = { like: { direction: 1, adjective: 'good' } };
</script>

<ImportPage {data} {form} {domain} {sources} {defaults} />
