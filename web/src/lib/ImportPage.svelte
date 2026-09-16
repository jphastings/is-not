<script lang="ts">
  import { enhance } from '$app/forms';
  import { reviewSentence } from '@is-not/sentence';
  import type { Subject, Tag } from '@is-not/lenses';
  import type { ImportRow } from '$lib/server/importers';
  import { m } from '$lib/paraglide/messages.js';
  import { getLocale } from '$lib/paraglide/runtime.js';
  import { resolveSubject } from '$lib/lenses';
  import Sentence from '$lib/Sentence.svelte';
  import TagRow from '$lib/TagRow.svelte';

  let {
    data,
    form,
    domain,
    sources,
    defaults,
  }: {
    data: { current: { did: string } | null; rows: ImportRow[]; error: string | null };
    form: unknown;
    domain: string;
    /** Display order of every source this importer can map, with its precomputed label. */
    sources: { key: string; label: string }[];
    defaults: Record<string, Tag>;
  } = $props();

  const locale = getLocale();

  // domain, sources and defaults are fixed for the lifetime of the route (a
  // new route means a new component instance), so capturing them once here
  // is correct — not a bug the reactive reference would fix.
  // svelte-ignore state_referenced_locally
  const MAPPING_KEY = `import-mapping:${domain}`;
  const DIRECTIONS = new Set([-2, -1, 0, 1, 2]);
  // svelte-ignore state_referenced_locally
  const sourceKeys = sources.map((s) => s.key);

  // svelte-ignore state_referenced_locally
  let mapping = $state<Record<string, Tag>>(structuredClone(defaults));
  let loaded = false;

  // localStorage only exists in the browser: loading (and then saving) the
  // mapping has to wait for mount, and the save effect must not fire before
  // the load has run or it would clobber the stored mapping with defaults.
  $effect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(MAPPING_KEY) ?? '{}');
      for (const key of sourceKeys) {
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
  const tagsFor = (row: { sources: string[] }) => row.sources.map((k) => mapping[k]);
  const complete = $derived([...used].every((k) => mapping[k].adjective.trim() !== ''));

  type Row = ImportRow & {
    selected: boolean;
    subject: Subject;
  };
  let rows = $state<Row[]>([]);
  let loading = $state(false);
  let sending = $state(false);

  // Cached across reloads (e.g. the load re-running after an import) so already-resolved
  // rows reappear instantly instead of refetching from the PDS. Only successes are cached:
  // a failed resolution isn't worth remembering across runs.
  const resolved = new Map<string, Promise<Subject>>();

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  // A network/CORS failure (a PDS 429's response carries no CORS header, so it surfaces as
  // this rather than an HTTP status) or an explicit 429/5xx is worth retrying; anything else
  // (404, malformed record, unsupported lens, DID resolution failure) won't fix itself.
  const isTransient = (e: unknown) =>
    e instanceof TypeError ||
    (e instanceof DOMException && e.name === 'TimeoutError') ||
    (e instanceof Error && /\b(429|5\d\d)$/.test(e.message));

  const MAX_ATTEMPTS = 8;
  const MAX_DELAY_MS = 30_000;

  async function resolveWithRetry(uri: string, mine: number): Promise<Subject | null> {
    const cached = resolved.get(uri);
    if (cached) return cached;

    let delay = 1000;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const resolution = await resolveSubject(uri);
        if ('error' in resolution) {
          console.warn(`skipping ${uri}: ${resolution.error}`);
          return null;
        }
        const promise = Promise.resolve(resolution.subject);
        resolved.set(uri, promise);
        return resolution.subject;
      } catch (e) {
        if (!isTransient(e) || attempt === MAX_ATTEMPTS) {
          console.warn(`skipping ${uri} after ${attempt} attempt(s):`, e);
          return null;
        }
        await sleep(delay);
        delay = Math.min(delay * 2, MAX_DELAY_MS);
        if (mine !== run) return null;
      }
    }
    return null;
  }

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
        const subject = await resolveWithRetry(row.subjectUri, mine);
        if (mine !== run) return;
        if (subject) rows.push({ ...row, subject, selected: true });
      }
      if (mine === run) loading = false;
    })();
  });

  type ImportResult = { uri: string; ok: boolean; error?: string; savedUri?: string };

  function sameTags(a: Tag[], b: Tag[]): boolean {
    if (a.length !== b.length) return false;
    const key = (t: Tag) => `${t.direction}\t${t.adjective}`;
    const sa = [...a].sort((x, y) => key(x).localeCompare(key(y)));
    const sb = [...b].sort((x, y) => key(x).localeCompare(key(y)));
    return sa.every((t, i) => t.direction === sb[i].direction && t.adjective === sb[i].adjective);
  }

  const unchanged = (row: Row) => row.existing !== null && sameTags(row.existing, tagsFor(row));

  const results = $derived(
    new Map(((form as { results?: ImportResult[] } | null)?.results ?? []).map((r) => [r.uri, r])),
  );

  // A row that was just imported keeps showing its result rather than vanishing
  // the moment the load re-runs and finds it now matches the existing review.
  const visible = $derived(rows.filter((row) => !unchanged(row) || results.has(row.subjectUri)));
  const selected = $derived(visible.filter((row) => row.selected));
  const selectableRows = $derived(visible);
  const allSelected = $derived(
    selectableRows.length > 0 && selectableRows.every((row) => row.selected),
  );
  const someSelected = $derived(selectableRows.some((row) => row.selected));

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
  <meta property="og:title" content={m.import_title({ domain })} />
</svelte:head>

<main>
  <h1 class="display">{m.import_heading({ domain })}</h1>

  {#if !data.current}
    <p class="intro">{m.import_signin({ domain })}</p>
    <button type="button" class="pill" popovertarget="login-popover">{m.sign_in()}</button>
  {:else if data.error}
    <p class="error" role="alert">{(errors[data.error] ?? (() => data.error))()}</p>
  {:else if data.rows.length === 0 || (!loading && visible.length === 0)}
    <p class="empty">{m.import_empty()}</p>
  {:else}
    <div class="mapping">
      <div class="mapping-head">
        <span>{domain}</span>
        <span>{m.home()}</span>
      </div>
      {#each sources.filter((s) => used.has(s.key)) as s (s.key)}
        <div class="mapping-row">
          <span class="source">{s.label}</span>
          <ul class="tags"><TagRow tag={mapping[s.key]} /></ul>
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
      {#if visible.length > 0}
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
        {#each visible as row (row.subjectUri)}
          {@const result = results.get(row.subjectUri)}
          <li class="row" class:dim={!row.selected}>
            <input type="checkbox" bind:checked={row.selected} aria-label={m.import_col_select()} />
            <span class="sentence">
              <Sentence
                parts={reviewSentence({ subject: row.subject, tags: tagsFor(row), locale })}
                animate={false}
              />
            </span>
            {#if row.existing !== null}<span class="badge">{m.update()}</span>{/if}
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
