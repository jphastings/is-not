<script lang="ts">
  import { enhance } from '$app/forms';
  import type { Subject, Tag } from '@is-not/lenses';
  import { m } from '$lib/paraglide/messages.js';
  import { getLocale } from '$lib/paraglide/runtime.js';
  import { RECORD_URI, resolveSubject } from '$lib/lenses';
  import { validateReview } from '$lib/review';
  import Login from '$lib/Login.svelte';

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
    state: () => m.error_state(),
    pds: () => m.error_pds(),
    handle: () => m.error_handle(),
    created: () => m.error_created(),
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

  const payload = $derived(
    JSON.stringify({
      subject: subject ? { ...subject, title: subjectText.trim() } : null,
      tags: tags.filter((t) => t.adjective.trim() !== ''),
      locale,
      prefilled,
    }),
  );

  const error = $derived(clientError ?? serverError);
  const canAdd = $derived((tags.at(-1)?.adjective ?? '').trim() !== '');
  // Save only exists once the sentence would survive the server's own check.
  const saveable = $derived(
    current !== null && subject !== null && validateReview(JSON.parse(payload)).ok,
  );

  // The fields are textareas so long titles wrap with the sentence, but a
  // review is one line: Enter submits rather than breaking it.
  function oneLine(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      (event.currentTarget as HTMLElement).closest('form')?.requestSubmit();
    }
  }

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
      <button type="button" class="slot handle" popovertarget="accounts-popover">
        @{current.handle || current.did}
      </button>
    {:else}
      <button type="button" class="slot" popovertarget="login-popover">
        {m.handle_placeholder()}
      </button>
    {/if}
    <span>{m.thinks()}</span>

    <span class="autosize subject" data-value={subjectText || m.subject_placeholder()}>
      <textarea
        bind:value={subjectText}
        rows="1"
        onchange={resolve}
        onkeydown={oneLine}
        onpaste={() => queueMicrotask(resolve)}
        placeholder={m.subject_placeholder()}
        aria-label={m.subject_placeholder()}
      ></textarea>
    </span>
    {#if resolving}<span class="hint">{m.resolving()}</span>{/if}

    <ul class="tags">
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
            <textarea
              bind:value={tag.adjective}
              rows="1"
              onkeydown={oneLine}
              placeholder={m.adjective_placeholder()}
              aria-label={m.adjective_placeholder()}
            ></textarea>
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

    {#if canAdd}
      <button
        type="button"
        class="plain and"
        onclick={() => (tags = [...tags, { direction: 1, adjective: '' }])}
      >
        {m.add_another()}
      </button>
    {/if}
  </div>

  {#if unsupported}<p class="note">{m.unsupported_note()}</p>{/if}

  <div class="actions">
    <button class="pill" class:hidden={!saveable} disabled={sending || !saveable}>
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

<div id="login-popover" popover="auto"><Login /></div>

{#if current}
  <div id="accounts-popover" popover="auto">
    <ul class="accounts">
      {#each accounts as account (account.did)}
        <li class:current={account.did === current.did}>
          <button form="switch-form" name="did" value={account.did} class="account">
            @{account.handle || account.did}
          </button>
          <button
            form="logout-form"
            name="did"
            value={account.did}
            class="signout"
            aria-label={m.sign_out()}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path d="M4 4 12 12M12 4 4 12" />
            </svg>
          </button>
        </li>
      {/each}
      <li class="another">
        <button type="button" popovertarget="login-popover">{m.sign_in()}</button>
      </li>
    </ul>
  </div>
{/if}

<form id="login-form" method="POST" action="/oauth/login" hidden></form>
<form id="switch-form" method="POST" action="/oauth/switch" hidden></form>
<form id="logout-form" method="POST" action="/oauth/logout" hidden></form>

<style>
  /* Laid out as text, not as flex items, so the browser can balance the lines. */
  .sentence {
    font-size: var(--step-3);
    text-wrap: balance;
  }

  .tags,
  .tags li {
    display: inline;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  /* Inputs grow with what is typed: the ::after twin sets the width. */
  .autosize {
    display: inline-grid;
    max-width: 100%;
    position: relative;
    vertical-align: baseline;
  }

  .autosize::after,
  .autosize textarea,
  .autosize select {
    grid-area: 1 / 1;
    font: inherit;
  }

  /* The hidden twin alone sets the box: a form control's intrinsic height and
     width differ per browser (Firefox sizes inputs taller than the same text),
     which would tilt the rules out of line. */
  .autosize::after {
    content: attr(data-value) ' ';
    visibility: hidden;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .autosize textarea,
  .autosize select {
    position: absolute;
    inset: 0;
    width: 100%;
    min-width: 0;
  }

  .autosize textarea {
    resize: none;
    overflow: hidden;
    text-align: inherit;
  }

  textarea,
  select {
    font: inherit;
    color: inherit;
    background: none;
    border: 0;
    padding: 0;
  }

  textarea::placeholder {
    color: var(--ink-soft);
    opacity: 0.7;
  }

  select {
    appearance: none;
    cursor: pointer;
  }

  /* Every part of the sentence is ruled on its own box, so they sit on one
     line however the part is built. The rule is a shadow, not a border, so
     thickening it on focus cannot change anyone's height. */
  .autosize,
  .slot {
    box-shadow: inset 0 -0.07em 0 var(--moss);
  }

  /* A box around a word would break the sentence, so focus thickens the rule. */
  .sentence :is(textarea, select, .slot):focus-visible {
    outline: none;
  }

  .autosize:has(:focus-visible),
  .slot:focus-visible {
    box-shadow: inset 0 -0.16em 0 var(--moss-deep);
  }

  .comma {
    margin-inline-start: -0.25em;
  }

  .subject textarea {
    color: var(--moss-deep);
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
    color: var(--ink-soft);
    text-decoration: none;
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

  /* Wears the inputs' clothes: empty it opens sign-in, filled it opens accounts. */
  .slot {
    font: inherit;
    color: var(--ink-soft);
    background: none;
    border: 0;
    padding: 0;
    cursor: pointer;
  }

  .handle {
    color: var(--ink);
    anchor-name: --who;
  }

  [popover] {
    border: 0;
    padding: 0;
    background: none;
    overflow: visible;
  }

  [popover]::backdrop {
    background: oklch(22% 0.03 140 / 0.3);
  }

  /* Anchored to the handle, so opening it moves nothing else on the page. */
  @supports (anchor-name: --a) {
    #accounts-popover {
      position: absolute;
      position-anchor: --who;
      position-area: bottom center;
      position-try-fallbacks: flip-block;
      margin: var(--space-2) 0 0;
    }

    #accounts-popover::backdrop {
      background: none;
    }
  }

  .accounts {
    list-style: none;
    margin: 0;
    padding: var(--space-2);
    display: grid;
    gap: var(--space-1);
    min-width: max-content;
    background: var(--paper);
    border: 1px solid var(--moss-tint);
    border-radius: 14px;
    box-shadow: var(--shadow);
    font-family: var(--font-body);
    font-size: var(--step-0);
    font-weight: 400;
    text-align: start;
  }

  /* One box per row: the outer corners are rounded and the halves inside it are
     clipped flush against each other. */
  .accounts li {
    display: flex;
    align-items: stretch;
    min-height: 2.75rem;
    border-radius: 10px;
    overflow: hidden;
  }

  .accounts li.current {
    background: var(--moss-tint);
  }

  .accounts button {
    font: inherit;
    color: inherit;
    background: none;
    border: 0;
    padding: var(--space-2) var(--space-3);
    cursor: pointer;
  }

  .accounts .account {
    flex: 1;
    display: flex;
    align-items: center;
    text-align: start;
  }

  .accounts li.current .account {
    font-weight: 700;
  }

  /* The whole right of the row. Square by explicit width rather than
     aspect-ratio, which contributes nothing to the panel's intrinsic width and
     so used to push the cross outside it. */
  .accounts .signout {
    display: grid;
    place-items: center;
    width: 2.75rem;
    padding: 0;
    color: var(--ink-soft);
  }

  /* A fraction of that square, so the cross sits the same distance from the
     top, right and bottom edges. */
  .accounts .signout svg {
    width: 40%;
    height: 40%;
    fill: none;
    stroke: currentcolor;
    stroke-width: 2;
    stroke-linecap: round;
  }

  .accounts .signout:hover {
    color: var(--ink);
    background: var(--moss-tint);
  }

  .accounts .another {
    border-top: 1px solid var(--moss-tint);
    margin-top: var(--space-1);
    padding-top: var(--space-1);
  }

  .accounts .another button {
    color: var(--moss-deep);
    width: 100%;
    text-align: start;
  }

  .hint,
  .note {
    font-family: var(--font-body);
    font-size: var(--step--1);
    font-weight: 400;
    color: var(--ink-soft);
  }

  .note {
    margin: var(--space-4) 0 0;
    text-align: center;
  }

  .actions {
    margin-top: var(--space-6);
    display: grid;
    justify-items: center;
    gap: var(--space-3);
  }

  /* Keeps its space, so the sentence never jumps when it becomes saveable. */
  .hidden {
    visibility: hidden;
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
