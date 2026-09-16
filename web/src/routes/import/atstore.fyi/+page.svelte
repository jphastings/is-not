<script lang="ts">
  import type { Tag } from '@is-not/lenses';
  import { m } from '$lib/paraglide/messages.js';
  import ImportPage from '$lib/ImportPage.svelte';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const domain = 'atstore.fyi';
  const SOURCE_KEYS = ['favourite', '5', '4', '3', '2', '1'];
  const sources = SOURCE_KEYS.map((key) => ({
    key,
    label: key === 'favourite' ? m.import_source_favourite() : m.import_source_rating({ rating: key }),
  }));
  const defaults: Record<string, Tag> = {
    favourite: { direction: 2, adjective: 'awesome' },
    '5': { direction: 2, adjective: 'good' },
    '4': { direction: 1, adjective: 'good' },
    '3': { direction: 0, adjective: 'good' },
    '2': { direction: -1, adjective: 'good' },
    '1': { direction: -2, adjective: 'good' },
  };
</script>

<ImportPage {data} {form} {domain} {sources} {defaults} />
