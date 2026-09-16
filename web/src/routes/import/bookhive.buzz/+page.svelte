<script lang="ts">
  import type { Tag } from '@is-not/lenses';
  import { m } from '$lib/paraglide/messages.js';
  import ImportPage from '$lib/ImportPage.svelte';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const domain = 'bookhive.buzz';

  // Bookhive stores a 1-10 star count but displays it as 5 half-stars, so the
  // mapping rows are labelled the same way: 1 -> ½★, 2 -> 1★, … 10 -> 5★.
  function halfStarLabel(stars: number): string {
    const whole = Math.floor(stars / 2);
    const half = stars % 2 === 1;
    return `${whole || ''}${half ? '½' : ''}`;
  }

  const SOURCE_KEYS = ['10', '9', '8', '7', '6', '5', '4', '3', '2', '1'];
  const sources = SOURCE_KEYS.map((key) => ({
    key,
    label: m.import_source_rating({ rating: halfStarLabel(Number(key)) }),
  }));
  const defaults: Record<string, Tag> = Object.fromEntries(
    SOURCE_KEYS.map((key) => {
      const stars = Number(key);
      const direction = (Math.floor((stars - 1) / 2) - 2) as Tag['direction'];
      return [key, { direction, adjective: 'good' }];
    }),
  );
</script>

<ImportPage {data} {form} {domain} {sources} {defaults} />
