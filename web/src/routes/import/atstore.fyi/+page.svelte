<script lang="ts">
  import { enhance } from '$app/forms';
  import { reviewSentence } from '@is-not/sentence';
  import type { Resolution, Subject, Tag } from '@is-not/lenses';
  import type { ImportSource } from '$lib/server/atstore';
  import { m } from '$lib/paraglide/messages.js';
  import { getLocale } from '$lib/paraglide/runtime.js';
  import { resolveSubject } from '$lib/lenses';
  import Login from '$lib/Login.svelte';
  import Sentence from '$lib/Sentence.svelte';
  import TagRow from '$lib/TagRow.svelte';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const locale = getLocale();
  const domain = 'atstore.fyi';

  const SOURCES: ImportSource[] = ['favourite', '5', '4', '3', '2', '1'];
  const DEFAULT_MAPPING: Record<ImportSource, Tag> = {
    favourite: { direction: 2, adjective: 'awesome' },
    '5': { direction: 2, adjective: 'good' },
    '4': { direction: 1, adjective: 'good' },
    '3': { direction: 0, adjective: 'good' },
    '2': { direction: -1, adjective: 'good' },
    '1': { direction: -2, adjective: 'good' },
  };
  const MAPPING_KEY = `import-mapping:${domain}`;
  const DIRECTIONS = new Set([-2, -1, 0, 1, 2]);

  let mapping = $state<Record<ImportSource, Tag>>(structuredClone(DEFAULT_MAPPING));
  let loaded = false;

  // localStorage only exists in the browser: loading (and then saving) the
  // mapping has to wait for mount, and the save effect must not fire before
  // the load has run or it would clobber the stored mapping with defaults.
  $effect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(MAPPING_KEY) ?? '{}');
      for (const key of SOURCES) {
        const entry = stored[key];
        if (
          entry &&
          DIRECTIONS.has(entry.direction) &&
          typeof entry.adjective === 'string'
        ) {
          mapping[key] = entry;
        }
      }
    } catch {
      // storage unavailable or corrupt: keep the defaults
    }
    loaded = true;
  });

  $effect(() => {
    const snapshot = JSON.stringify(mapping);
    if (!loaded) return;
    try {
      localStorage.setItem(MAPPING_KEY, snapshot);
    } catch {
      // storage unavailable: the mapping just won't be remembered
    }
  });

  const used = $derived(new Set(data.rows.flatMap((r) => r.sources)));
  const tagsFor = (row: { sources: ImportSource[] }) => row.sources.map((k) => mapping[k]);
  const complete = $derived([...used].every((k) => mapping[k].adjective.trim() !== ''));

  type Row = (typeof data.rows)[number] & {
    selected: boolean;
    subject: Subject | null;
    error: string | null;
  };
  let rows = $state<Row[]>([]);
  let loading = $state(false);
  let sending = $state(false);

  // Cached across reloads (e.g. the load re-running after an import) so already-resolved
  // rows reappear instantly instead of refetching from the PDS.
  const resolved = new Map<string, Promise<Resolution>>();

  // Subjects are resolved client-side (the lenses' wasm only loads in the browser),
  // one row at a time — the PDS rate-limits a burst of requests. rows starts empty and
  // fills in as each resolution lands.
  // ponytail: one in flight at a time; a small concurrency pool is the upgrade if it's slow.
  let run = 0;
  $effect(() => {
    const mine = ++run;
    rows = [];
    loading = true;
    void (async () => {
      for (const row of data.rows) {
        let promise = resolved.get(row.subjectUri);
        if (!promise) {
          promise = resolveSubject(row.subjectUri);
          promise.catch(() => resolved.delete(row.subjectUri));
          resolved.set(row.subjectUri, promise);
        }
        try {
          const resolution = await promise;
          if (mine !== run) return;
          if ('error' in resolution) {
            rows.push({ ...row, subject: null, error: resolution.error, selected: false });
          } else {
            rows.push({ ...row, subject: resolution.subject, error: null, selected: true });
          }
        } catch (e) {
          if (mine !== run) return;
          rows.push({
            ...row,
            subject: null,
            error: e instanceof Error ? e.message : 'unresolved',
            selected: false,
          });
        }
      }
      if (mine === run) loading = false;
    })();
  });

  type ImportResult = { uri: string; ok: boolean; error?: string; savedUri?: string };

  const selected = $derived(rows.filter((row) => row.selected && row.subject));
  const selectableRows = $derived(rows.filter((row) => row.subject !== null));
  const allSelected = $derived(
    selectableRows.length > 0 && selectableRows.every((row) => row.selected),
  );
  const someSelected = $derived(selectableRows.some((row) => row.selected));
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
  <h1 class="display"><a class="home" href="/">{m.home()}</a> {m.import_heading({ domain })}</h1>

  {#if !data.current}
    <p class="intro">{m.import_signin({ domain })}</p>
    <button type="button" class="pill" popovertarget="login-popover">{m.sign_in()}</button>
    <div id="login-popover" popover="auto"><Login /></div>
    <form id="login-form" method="POST" action="/oauth/login" hidden></form>
  {:else if data.error}
    <p class="error" role="alert">{(errors[data.error] ?? (() => data.error))()}</p>
  {:else if data.rows.length === 0}
    <p class="empty">{m.import_empty()}</p>
  {:else}
    <div class="mapping">
      <div class="mapping-head">
        <span>{domain}</span>
        <span>{m.home()}</span>
      </div>
      {#each SOURCES.filter((k) => used.has(k)) as key (key)}
        <div class="mapping-row">
          <span class="source"
            >{key === 'favourite'
              ? m.import_source_favourite()
              : m.import_source_rating({ rating: key })}</span
          >
          <ul class="tags"><TagRow tag={mapping[key]} /></ul>
        </div>
      {/each}
    </div>

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
      {#if rows.length > 0}
        <div class="head">
          <label class="pill secondary select-all">
            <input
              type="checkbox"
              checked={allSelected}
              indeterminate={someSelected && !allSelected}
              onchange={(e) => {
                const checked = e.currentTarget.checked;
                for (const row of selectableRows) row.selected = checked;
              }}
            />
            {allSelected ? m.import_select_none() : m.import_select_all()}
          </label>
        </div>
      {/if}
      <ul class="rows">
        {#each rows as row (row.subjectUri)}
          {@const result = results.get(row.subjectUri)}
          <li class="row" class:dim={!row.selected}>
            <input
              type="checkbox"
              bind:checked={row.selected}
              disabled={!row.subject}
              aria-label={m.import_col_select()}
            />
            <span class="sentence">
              {#if row.subject}
                <Sentence
                  parts={reviewSentence({ subject: row.subject, tags: tagsFor(row), locale })}
                  animate={false}
                />
              {:else if row.error}
                <span class="error">{row.error}</span>
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
        {#if loading}
          <li class="loading">{m.import_loading()}</li>
        {/if}
      </ul>

      {#each selected as row (row.subjectUri)}
        <input
          type="hidden"
          name="row"
          value={JSON.stringify({
            subject: row.subject,
            tags: tagsFor(row),
            locale,
            createdAt: row.createdAt,
          })}
        />
      {/each}

      <button class="pill" disabled={sending || selected.length === 0 || !complete}>
        {m.import_button({ count: selected.length })}
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
  }

  .home:hover {
    text-decoration: underline;
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

  .mapping {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--space-1) var(--space-4);
    font-size: var(--step--1);
    max-width: 30rem;
  }

  .mapping-head {
    display: contents;
    color: var(--ink-soft);
  }

  .mapping-head span {
    padding-bottom: var(--space-1);
    border-bottom: 1px solid var(--moss-tint);
  }

  .mapping-row {
    display: contents;
  }

  .source {
    color: var(--ink-soft);
    align-self: center;
  }

  .mapping .tags {
    display: inline;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .head {
    padding-block: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--moss-tint);
  }

  .select-all {
    padding: var(--space-1) var(--space-3) var(--space-1) var(--space-2);
    font-size: var(--step--1);
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

  /* Native controls, tinted: accent-color covers checked and indeterminate. */
  input[type='checkbox'] {
    accent-color: var(--moss-deep);
    width: 1.1em;
    height: 1.1em;
    margin: 0;
    cursor: pointer;
  }

  .row input[type='checkbox'] {
    align-self: center;
  }

  /* The checkbox stays full-strength: it is the way back in. */
  .row.dim > :not(input) {
    opacity: 0.45;
  }

  .sentence {
    flex: 1 1 20rem;
  }

  .loading {
    padding-block: var(--space-3);
    color: var(--ink-soft);
    font-size: var(--step--1);
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
