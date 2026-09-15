<script lang="ts">
  import { enhance } from '$app/forms';
  import { m } from '$lib/paraglide/messages.js';
  import { getLocale } from '$lib/paraglide/runtime.js';
  import Login from '$lib/Login.svelte';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const locale = getLocale();

  type Row = (typeof data.rows)[number] & { selected: boolean };
  let rows = $state<Row[]>([]);
  let sending = $state(false);

  // Re-derived (not $derived directly) so a checkbox can be toggled without
  // fighting a reactive recompute, but still resets when a reload brings fresh rows.
  $effect(() => {
    rows = data.rows.map((row) => ({ ...row, selected: row.error === null }));
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

  const directionLabels: Record<number, () => string> = {
    2: () => m.dir_2(),
    1: () => m.dir_1(),
    0: () => m.dir_0(),
    [-1]: () => m.dir_m1(),
    [-2]: () => m.dir_m2(),
  };
</script>

<svelte:head>
  <title>{m.import_atstore_title()}</title>
</svelte:head>

<main>
  <a class="home display" href="/">{m.home()}</a>
  <h1 class="display">{m.import_atstore_heading()}</h1>

  {#if !data.current}
    <p class="intro">{m.import_atstore_signin()}</p>
    <button type="button" class="pill" popovertarget="login-popover">{m.sign_in()}</button>
    <div id="login-popover" popover="auto"><Login /></div>
    <form id="login-form" method="POST" action="/oauth/login" hidden></form>
  {:else if data.error}
    <p class="error" role="alert">{(errors[data.error] ?? (() => data.error))()}</p>
  {:else if data.rows.length === 0}
    <p class="intro">{m.import_atstore_intro()}</p>
    <p class="empty">{m.import_atstore_empty()}</p>
  {:else}
    <p class="intro">{m.import_atstore_intro()}</p>
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
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col"><span class="sr-only">{m.import_col_select()}</span></th>
              <th scope="col">{m.import_col_app()}</th>
              <th scope="col">{m.import_col_source()}</th>
              <th scope="col">{m.import_col_tags()}</th>
              <th scope="col"><span class="sr-only">{m.import_col_status()}</span></th>
            </tr>
          </thead>
          <tbody>
            {#each rows as row (row.subjectUri)}
              {@const result = results.get(row.subjectUri)}
              <tr class:has-error={!!row.error}>
                <td>
                  <input
                    type="checkbox"
                    bind:checked={row.selected}
                    disabled={!!row.error}
                    aria-label={m.import_col_select()}
                  />
                </td>
                <td>
                  {#if row.subject}
                    <a href={`https://pdsls.dev/${row.subject.uri}`} rel="noreferrer"
                      >{row.subject.title}</a
                    >
                    {#if row.isUpdate}<span class="badge">{m.update()}</span>{/if}
                  {:else}
                    <span class="unresolved">{row.subjectUri}</span>
                  {/if}
                </td>
                <td>
                  <ul class="sources">
                    {#each row.sources as source (source.uri)}
                      <li>
                        <a href={`https://pdsls.dev/${source.uri}`} rel="noreferrer">
                          {source.collection === 'review'
                            ? m.import_reviewed({ rating: source.rating ?? 0 })
                            : m.import_favorited()}
                        </a>
                      </li>
                    {/each}
                  </ul>
                </td>
                <td>
                  <ul class="tags">
                    {#each row.tags as tag, i (i)}
                      <li>
                        {(directionLabels[tag.direction] ?? (() => tag.direction))()}
                        {tag.adjective}
                      </li>
                    {/each}
                  </ul>
                </td>
                <td>
                  {#if row.error}
                    <span class="error">{row.error}</span>
                  {:else if result}
                    <span class={result.ok ? 'ok' : 'error'}>
                      {result.ok
                        ? m.import_done()
                        : (errors[result.error ?? ''] ?? (() => result.error))()}
                    </span>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      {#each selected as row (row.subjectUri)}
        <input
          type="hidden"
          name="row"
          value={JSON.stringify({ subject: row.subject, tags: row.tags, locale, createdAt: row.createdAt })}
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

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }

  .table-wrap {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--step--1);
  }

  th {
    text-align: start;
    font-weight: 700;
    color: var(--ink-soft);
    padding: 0 var(--space-3) var(--space-2);
  }

  td {
    padding: var(--space-3);
    vertical-align: top;
    border-top: 1px solid var(--moss-tint);
  }

  tr.has-error td {
    color: var(--ink-soft);
  }

  a {
    color: var(--moss-deep);
  }

  .badge {
    margin-inline-start: var(--space-2);
    padding: 0.1em 0.6em;
    background: var(--moss-tint);
    color: var(--moss-deep);
    border-radius: var(--radius-pill);
    font-size: var(--step--1);
  }

  .unresolved {
    font-family: monospace;
    word-break: break-all;
  }

  .sources,
  .tags {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--space-1);
  }

  .ok {
    color: var(--moss-deep);
  }

  .error {
    color: var(--ink);
  }

  .empty {
    color: var(--ink-soft);
  }

  form > .pill {
    margin-top: var(--space-5);
  }
</style>
