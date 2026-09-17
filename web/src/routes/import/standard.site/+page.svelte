<script lang="ts">
  import type { Tag } from '@is-not/lenses';
  import { m } from '$lib/paraglide/messages.js';
  import ImportPage from '$lib/ImportPage.svelte';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const domain = 'standard.site';
  const sources = [{ key: 'recommend', label: m.import_source_recommend() }];
  const defaults: Record<string, Tag> = { recommend: { direction: 1, adjective: 'good' } };
</script>

<ImportPage {data} {form} {domain} {sources} {defaults} />
