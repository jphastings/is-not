<script lang="ts">
  import { m } from '$lib/paraglide/messages.js';
  import ReviewForm from '$lib/ReviewForm.svelte';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
</script>

<svelte:head>
  <title>{m.review_title()}</title>
</svelte:head>

<main>
  <h1>{m.say_something()}</h1>
  <ReviewForm
    accounts={data.accounts}
    current={data.current}
    serverError={form && 'error' in form ? String(form.error) : data.error}
    saved={form && 'uri' in form ? String(form.uri) : null}
  />
</main>

<style>
  main {
    padding: var(--space-5);
    max-width: 52rem;
    margin-inline: auto;
    min-height: 100dvh;
    display: grid;
    align-content: center;
    text-align: center;
  }

  h1 {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
</style>
