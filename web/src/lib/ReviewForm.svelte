<script lang="ts">
  import { enhance } from '$app/forms';
  import type { Subject, Tag } from '@is-not/lenses';
  import { m } from '$lib/paraglide/messages.js';
  import { getLocale } from '$lib/paraglide/runtime.js';
  import { RECORD_URI, resolveSubject } from '$lib/lenses';
  import { validateReview } from '$lib/review';

  type Account = { did: string; handle: string };
  type ExistingReview = { rkey: string; tags: Tag[]; locale?: string };

  let {
    accounts,
    current,
    serverError,
    saved,
  }: {
    accounts: Account[];
    current: Account | null;
    serverError: string | null;
    saved: string | null;
  } = $props();

  const directions = [
    { value: 2, label: () => m.dir_2() },
    { value: 1, label: () => m.dir_1() },
    { value: -1, label: () => m.dir_m1() },
    { value: -2, label: () => m.dir_m2() },
  ];

  const errors: Record<string, () => string> = {
    signin: () => m.error_signin(),
    subject: () => m.error_subject(),
    title: () => m.error_title(),
    tags: () => m.error_tags(),
    adjective: () => m.error_adjective(),
    direction: () => m.error_adjective(),
    locale: () => m.error_locale(),
    handle: () => m.error_handle(),
    state: () => m.error_state(),
    pds: () => m.error_pds(),
    unresolved: () => m.error_subject(),
  };

  let subjectText = $state('');
  let subject = $state<Subject | null>(null);
  let resolving = $state(false);
  let unsupported = $state(false);
  let existing = $state(false);
  let prefilled = $state<string[]>([]);
  let tags = $state<Tag[]>([{ direction: 1, adjective: '' }]);
  let clientError = $state<string | null>(null);
  let sending = $state(false);
  let resolution = 0;

  const locale = getLocale();
  const languageName =
    new Intl.DisplayNames([locale], { type: 'language' }).of(locale) ?? locale;

  const payload = $derived(
    JSON.stringify({
      subject: subject ? { ...subject, title: subjectText.trim() } : null,
      tags: tags.filter((t) => t.adjective.trim() !== ''),
      locale,
      prefilled,
    }),
  );

  const error = $derived(clientError ?? serverError);

  async function resolve() {
    const uri = subjectText.trim();
    if (!RECORD_URI.test(uri)) return;
    const token = ++resolution;
    resolving = true;
    clientError = null;
    try {
      const result = await resolveSubject(uri);
      if (token !== resolution) return;
      if ('error' in result) {
        clientError = 'subject';
        return;
      }
      subject = result.subject;
      subjectText = result.subject.title;
      unsupported = !result.supported;
      await loadExisting(uri, token);
    } catch {
      if (token === resolution) clientError = 'subject';
    } finally {
      if (token === resolution) resolving = false;
    }
  }

  async function loadExisting(uri: string, token: number) {
    const res = await fetch(`/review/existing?uri=${encodeURIComponent(uri)}`);
    const review = (await res.json()) as ExistingReview | null;
    if (token !== resolution || !review) return;
    existing = true;
    prefilled = review.tags.map((t) => t.adjective);
    tags = review.tags.length > 0 ? review.tags : tags;
  }
</script>

<form
  method="POST"
  action="?/save"
  use:enhance={({ cancel }) => {
    const parsed = validateReview(JSON.parse(payload));
    if (!parsed.ok) {
      clientError = parsed.error;
      cancel();
      return;
    }
    clientError = null;
    sending = true;
    return async ({ update }) => {
      sending = false;
      await update({ reset: false });
    };
  }}
>
  <input type="hidden" name="review" value={payload} />

  <div class="display sentence">
    {#if current}
      <details class="who">
        <summary>@{current.handle || current.did}</summary>
        <div class="accounts">
          {#each accounts.filter((a) => a.did !== current.did) as account (account.did)}
            <button form="switch-form" name="did" value={account.did} class="plain">
              @{account.handle || account.did}
            </button>
          {/each}
          <input form="login-form" name="handle" placeholder={m.handle_placeholder()} />
          <button form="login-form" class="plain">{m.sign_in_another()}</button>
          <button form="logout-form" name="did" value={current.did} class="plain">
            {m.sign_out()}
          </button>
        </div>
      </details>
      <span>{m.thinks()}</span>
    {:else}
      <span class="autosize" data-value={m.handle_placeholder()}>
        <input form="login-form" name="handle" size="1" placeholder={m.handle_placeholder()} />
      </span>
      <button form="login-form" class="plain sign-in">{m.sign_in()}</button>
      <span>{m.thinks()}</span>
    {/if}

    <span class="autosize subject" data-value={subjectText || m.subject_placeholder()}>
      <input
        bind:value={subjectText}
        size="1"
        onchange={resolve}
        onpaste={() => queueMicrotask(resolve)}
        placeholder={m.subject_placeholder()}
        aria-label={m.subject_placeholder()}
      />
    </span>
    {#if resolving}<span class="hint">{m.resolving()}</span>{/if}

    <ul>
      {#each tags as tag, i (i)}
        <li>
          <span
            class="autosize direction"
            data-value={directions.find((d) => d.value === tag.direction)?.label()}
          >
            <select bind:value={tag.direction} aria-label={m.dir_1()}>
              {#each directions as direction (direction.value)}
                <option value={direction.value}>{direction.label()}</option>
              {/each}
            </select>
          </span>
          <span class="autosize adjective" data-value={tag.adjective || m.adjective_placeholder()}>
            <input
              bind:value={tag.adjective}
              size="1"
              placeholder={m.adjective_placeholder()}
              aria-label={m.adjective_placeholder()}
            />
          </span>
          {#if i < tags.length - 1}<span class="comma">,</span>{/if}
          {#if tags.length > 1}
            <button
              type="button"
              class="plain remove"
              aria-label={m.remove()}
              onclick={() => (tags = tags.filter((_, n) => n !== i))}
            >
              &times;
            </button>
          {/if}
        </li>
      {/each}
    </ul>

    <button
      type="button"
      class="plain and"
      onclick={() => (tags = [...tags, { direction: 1, adjective: '' }])}
    >
      {m.add_another()}
    </button>
  </div>

  <p class="meta">
    {m.in_locale({ locale: languageName })}
    {#if unsupported}<span class="note">{m.unsupported_note()}</span>{/if}
  </p>

  <div class="actions">
    <button class="pill" disabled={sending || !current}>
      {existing ? m.update() : m.save()}
    </button>
    {#if error}<p class="error" role="alert">{(errors[error] ?? (() => error))()}</p>{/if}
    {#if saved}
      <p class="saved">
        {m.saved()}
        <a href={`https://pdsls.dev/${saved}`} rel="noreferrer">{m.view_record()}</a>
      </p>
    {/if}
  </div>
</form>

<form id="login-form" method="POST" action="/oauth/login" hidden></form>
<form id="switch-form" method="POST" action="/oauth/switch" hidden></form>
<form id="logout-form" method="POST" action="/oauth/logout" hidden></form>

<style>
  .sentence {
    font-size: var(--step-3);
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 0.3em;
  }

  ul {
    display: contents;
    list-style: none;
  }

  li {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 0.3em;
  }

  /* Inputs grow with what is typed: the ::after twin sets the width. */
  .autosize {
    display: inline-grid;
    max-width: 100%;
    position: relative;
  }

  .autosize::after,
  .autosize input,
  .autosize select {
    grid-area: 1 / 1;
    font: inherit;
  }

  .autosize::after {
    content: attr(data-value) ' ';
    visibility: hidden;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .autosize input {
    width: 100%;
    min-width: 0;
  }

  /* A select is always as wide as its widest option, so take it out of the
     grid's sizing and let the hidden twin hold the selected option's width. */
  .autosize select {
    position: absolute;
    inset: 0;
    width: 100%;
    min-width: 0;
  }

  input,
  select {
    font: inherit;
    color: inherit;
    background: none;
    border: 0;
    padding: 0;
    border-radius: 2px;
  }

  input {
    border-bottom: 0.07em solid var(--moss);
  }

  input::placeholder {
    color: var(--ink-soft);
    opacity: 0.7;
  }

  select {
    appearance: none;
    cursor: pointer;
  }

  .direction {
    border-bottom: 0.07em solid var(--moss);
  }

  .comma {
    margin-inline-start: -0.25em;
  }

  .subject input {
    color: var(--moss-deep);
  }

  .adjective input {
    background: var(--moss-tint);
    border-bottom-color: var(--moss-deep);
  }

  .who {
    display: inline;
  }

  .who summary {
    display: inline;
    cursor: pointer;
    list-style: none;
    text-decoration: underline;
    text-decoration-color: var(--moss);
    text-decoration-thickness: 0.07em;
    text-underline-offset: 0.12em;
  }

  .who summary::-webkit-details-marker {
    display: none;
  }

  .accounts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-4);
    margin-block: var(--space-2);
    padding: var(--space-3);
    background: var(--moss-tint);
    border-radius: 14px;
    font-family: var(--font-body);
    font-size: var(--step-0);
    font-weight: 400;
  }

  .plain {
    font: inherit;
    color: var(--moss-deep);
    background: none;
    border: 0;
    padding: 0;
    cursor: pointer;
    text-decoration: underline;
  }

  .and {
    font-size: var(--step-0);
    font-family: var(--font-body);
    align-self: center;
  }

  .remove {
    font-size: var(--step-1);
    line-height: 1;
    color: var(--ink-soft);
    text-decoration: none;
    padding-inline: 0.15em;
    align-self: center;
  }

  .remove:hover {
    color: var(--ink);
  }

  .sign-in {
    font-size: var(--step-0);
    font-family: var(--font-body);
  }

  .hint,
  .note {
    font-family: var(--font-body);
    font-size: var(--step--1);
    font-weight: 400;
    color: var(--ink-soft);
  }

  .meta {
    margin: var(--space-4) 0 0;
    color: var(--ink-soft);
    font-size: var(--step--1);
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }

  .actions {
    margin-top: var(--space-5);
    display: grid;
    justify-items: start;
    gap: var(--space-3);
  }

  .error,
  .saved {
    margin: 0;
  }

  .error {
    color: var(--ink);
    border-bottom: 2px solid var(--moss);
  }

  .saved a {
    color: var(--moss-deep);
    margin-inline-start: var(--space-2);
  }
</style>
