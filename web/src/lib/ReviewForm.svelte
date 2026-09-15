<script lang="ts">
  import { enhance } from '$app/forms';
  import { page } from '$app/state';
  import type { Subject, Tag } from '@is-not/lenses';
  import { m } from '$lib/paraglide/messages.js';
  import { getLocale } from '$lib/paraglide/runtime.js';
  import { validateReview } from '$lib/review';
  import Login from '$lib/Login.svelte';
  import TagRow from '$lib/TagRow.svelte';
  import SubjectField from '$lib/SubjectField.svelte';

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
    subject_person: () => m.error_subject_person(),
  };

  let subjectText = $state('');
  let subject = $state<Subject | null>(null);
  let unsupported = $state(false);
  let existing = $state(false);
  let prefilled = $state<string[]>([]);
  let tags = $state<Tag[]>([{ direction: 1, adjective: '' }]);
  let clientError = $state<string | null>(null);
  let sending = $state(false);

  // A subject shared as a link resolves the same way a typed or pasted one
  // does; only ever applied once, even if the field is cleared afterwards.
  const initialSubjectUri = page.url.searchParams.get('subject') ?? undefined;

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

  // Picking a subject (fresh or re-picked) starts a clean slate: any tags
  // shown belong to whatever was loaded for it, never the previous subject.
  function onSubjectChosen(uri: string) {
    existing = false;
    prefilled = [];
    tags = [{ direction: 1, adjective: '' }];
    loadExisting(uri);
  }

  function onSubjectCleared() {
    existing = false;
    prefilled = [];
    tags = [{ direction: 1, adjective: '' }];
  }

  async function loadExisting(uri: string) {
    const res = await fetch(`/review/existing?uri=${encodeURIComponent(uri)}`);
    const review = (await res.json()) as ExistingReview | null;
    if (subject?.uri !== uri || !review) return;
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

    <SubjectField
      bind:subject
      bind:text={subjectText}
      bind:unsupported
      bind:error={clientError}
      initialUri={initialSubjectUri}
      placeholder={m.subject_placeholder()}
      onchosen={onSubjectChosen}
      onclear={onSubjectCleared}
    />

    <ul class="tags">
      {#each tags as tag, i (i)}
        <TagRow
          {tag}
          separator={i >= tags.length - 1 ? null : i === tags.length - 2 ? 'and' : 'comma'}
          onRemove={tags.length > 1 ? () => (tags = tags.filter((_, n) => n !== i)) : undefined}
        />
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

  .tags {
    display: inline;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  /* Every part of the sentence is ruled on its own box, so they sit on one
     line however the part is built. The rule is a shadow, not a border, so
     thickening it on focus cannot change anyone's height. Subject and
     adjective fields draw their own matching rule (SubjectField, TagRow):
     Svelte scopes styles per-component, so this can't be shared here. */
  .slot {
    box-shadow: inset 0 -0.07em 0 var(--moss);
  }

  /* A box around a word would break the sentence, so focus thickens the rule. */
  .sentence .slot:focus-visible {
    outline: none;
  }

  .slot:focus-visible {
    box-shadow: inset 0 -0.16em 0 var(--moss-deep);
  }

  /* A slot opens its list rather than holding focus, so while that list is up
     its rule thickens the same way a field's does while the field is focused.
     No selector reaches an invoker from its popover, so this asks the ancestor
     both share whether the popover it contains is open. */
  :global(main:has(#login-popover:popover-open)) .slot,
  :global(main:has(#accounts-popover:popover-open)) .slot {
    box-shadow: inset 0 -0.16em 0 var(--moss-deep);
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

  /* Paper flips with the theme, so half of it over the row reads as lighter on
     light and darker on dark. The tint this used to use is the selected row's
     own colour, which left the cross invisible on exactly the row it matters. */
  .accounts .signout:hover {
    color: var(--ink);
    background: color-mix(in oklch, var(--paper) 50%, transparent);
  }

  .accounts .another button {
    color: var(--moss-deep);
    width: 100%;
    text-align: start;
  }

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
  /* `font: inherit` carries the font shorthand's own line-height, not the one
     the sentence cascades, so a field's box was the font's line-height while
     the words beside it are as tall as the font's real metrics: every field
     rode ~9px high, and a wrapped line staggered. `normal` is those metrics.
     Last in the sheet because every `font` shorthand above resets it. */
  .slot {
    line-height: normal;
  }
</style>
