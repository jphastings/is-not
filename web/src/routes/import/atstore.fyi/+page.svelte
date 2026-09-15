<script lang="ts">
  import { enhance } from '$app/forms';
  import { reviewSentence } from '@is-not/sentence';
  import type { Subject } from '@is-not/lenses';
  import { m } from '$lib/paraglide/messages.js';
  import { getLocale } from '$lib/paraglide/runtime.js';
  import { resolveSubject } from '$lib/lenses';
  import Login from '$lib/Login.svelte';
  import Sentence from '$lib/Sentence.svelte';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const locale = getLocale();
  const domain = 'atstore.fyi';

  type Row = (typeof data.rows)[number] & {
    selected: boolean;
    subject: Subject | null;
    error: string | null;
  };
  let rows = $state<Row[]>([]);
  let sending = $state(false);

  // Re-derived (not $derived directly) so a checkbox can be toggled without
  // fighting a reactive recompute, but still resets when a reload brings fresh rows.
  // Subjects are resolved client-side (the lenses' wasm only loads in the browser),
  // one row at a time, filling in as they land.
  $effect(() => {
    rows = data.rows.map((row) => ({ ...row, selected: false, subject: null, error: null }));
    for (const row of rows) {
      resolveSubject(row.subjectUri)
        .then((resolution) => {
          const target = rows.find((r) => r.subjectUri === row.subjectUri);
          if (!target) return;
          if ('error' in resolution) {
            target.error = resolution.error;
          } else {
            target.subject = resolution.subject;
            target.selected = true;
          }
        })
        .catch((e) => {
          const target = rows.find((r) => r.subjectUri === row.subjectUri);
          if (target) target.error = e instanceof Error ? e.message : 'unresolved';
        });
    }
  });

  type ImportResult = { uri: string; ok: boolean; error?: string; savedUri?: string };

  const selected = $derived(rows.filter((row) => row.selected && row.subject));
  const results = $derived(
    new Map(((form as { results?: ImportResult[] } | null)?.results ?? []).map((r) => [r.uri, r])),
  );

  const errors: Record<string, () => string> = {
    signin: () => m.error_signin(),
    subject: () => m.error_subject(),
    title: () => m.error_title(),
    tags: () => m.error_tags(),
    adjective: () => m.error_adjective(),
    direction: () => m.error_adjective(),
    locale: () => m.error_locale(),
    pds: () => m.error_pds(),
  };
</script>

<svelte:head>
  <title>{m.import_title({ domain })}</title>
</svelte:head>

<main>
  <a class="home display" href="/">{m.home()}</a>
  <h1 class="display">{m.import_heading({ domain })}</h1>

  {#if !data.current}
    <p class="intro">{m.import_signin({ domain })}</p>
    <button type="button" class="pill" popovertarget="login-popover">{m.sign_in()}</button>
    <div id="login-popover" popover="auto"><Login /></div>
    <form id="login-form" method="POST" action="/oauth/login" hidden></form>
  {:else if data.error}
    <p class="error" role="alert">{(errors[data.error] ?? (() => data.error))()}</p>
  {:else if data.rows.length === 0}
    <p class="intro">{m.import_intro({ domain })}</p>
    <p class="empty">{m.import_empty()}</p>
  {:else}
    <p class="intro">{m.import_intro({ domain })}</p>
    <form
      method="POST"
      action="?/import"
      use:enhance={() => {
        sending = true;
        return async ({ update }) => {
          sending = false;
          await update({ reset: false });
        };
      }}
    >
      <ul class="rows">
        {#each rows as row (row.subjectUri)}
          {@const result = results.get(row.subjectUri)}
          <li class="row">
            <input
              type="checkbox"
              bind:checked={row.selected}
              disabled={!row.subject}
              aria-label={m.import_col_select()}
            />
            <span class="sentence">
              {#if row.subject}
                <Sentence
                  parts={reviewSentence({ subject: row.subject, tags: row.tags, locale })}
                  animate={false}
                />
              {:else if row.error}
                <span class="error">{row.error}</span>
              {:else}
                <span class="placeholder">&hellip;</span>
              {/if}
            </span>
            {#if row.isUpdate}<span class="badge">{m.update()}</span>{/if}
            {#if result}
              <span class={result.ok ? 'ok' : 'error'}>
                {result.ok
                  ? m.import_done()
                  : (errors[result.error ?? ''] ?? (() => result.error))()}
              </span>
            {/if}
          </li>
        {/each}
      </ul>

      {#each selected as row (row.subjectUri)}
        <input
          type="hidden"
          name="row"
          value={JSON.stringify({
            subject: row.subject,
            tags: row.tags,
            locale,
            createdAt: row.createdAt,
          })}
        />
      {/each}

      <button class="pill" disabled={sending || selected.length === 0}>
        {m.import_button()}
      </button>
    </form>
  {/if}
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

  .home {
    color: var(--moss-deep);
    text-decoration: none;
    font-size: var(--step-1);
    justify-self: start;
  }

  h1 {
    font-size: var(--step-3);
    margin: 0;
  }

  .intro {
    margin: 0;
    color: var(--ink-soft);
    max-width: 50ch;
  }

  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-2) var(--space-3);
    padding-block: var(--space-3);
    border-bottom: 1px solid var(--moss-tint);
    font-size: var(--step-1);
  }

  .row input[type='checkbox'] {
    align-self: center;
  }

  .sentence {
    flex: 1 1 20rem;
  }

  .placeholder {
    color: var(--ink-soft);
  }

  .badge {
    padding: 0.1em 0.6em;
    background: var(--moss-tint);
    color: var(--moss-deep);
    border-radius: var(--radius-pill);
    font-size: var(--step--1);
  }

  .ok {
    color: var(--moss-deep);
  }

  .error {
    color: var(--ink);
  }

  .row .ok,
  .row .error {
    font-size: var(--step--1);
  }

  .empty {
    color: var(--ink-soft);
  }

  form > .pill {
    margin-top: var(--space-5);
  }
</style>
