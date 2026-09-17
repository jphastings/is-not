<script lang="ts">
  import type { Tag } from '@is-not/lenses';
  import { m } from '$lib/paraglide/messages.js';
  import ImportPage from '$lib/ImportPage.svelte';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const domain = 'popfeed.social';

  // popfeed's 0-10 rating displays as 5 half-stars: 10 -> 5★, 1 -> ½★, 0 -> 0★.
  function halfStarLabel(rating: number): string {
    const whole = Math.floor(rating / 2);
    const half = rating % 2 === 1;
    if (whole === 0 && !half) return '0';
    return `${whole || ''}${half ? '½' : ''}`;
  }

  const SOURCE_KEYS = ['10', '9', '8', '7', '6', '5', '4', '3', '2', '1', '0'];
  const sources = SOURCE_KEYS.map((key) => ({
    key,
    label: m.import_source_rating({ rating: halfStarLabel(Number(key)) }),
  }));
  const defaults: Record<string, Tag> = Object.fromEntries(
    SOURCE_KEYS.map((key) => {
      const rating = Number(key);
      const direction = Math.min(2, Math.floor(rating / 2) - 2) as Tag['direction'];
      return [key, { direction, adjective: 'good' }];
    }),
  );
</script>

<ImportPage {data} {form} {domain} {sources} {defaults} />
