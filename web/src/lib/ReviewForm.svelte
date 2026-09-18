<script lang="ts">
  import { tick } from 'svelte';
  import { enhance } from '$app/forms';
  import { sortTags } from '@is-not/sentence';
  import { page } from '$app/state';
  import type { Subject, Tag } from '@is-not/lenses';
  import { m } from '$lib/paraglide/messages.js';
  import { getLocale } from '$lib/paraglide/runtime.js';
  import { mergeTags, validateReview } from '$lib/review';
  import TagRow from '$lib/TagRow.svelte';
  import SubjectField from '$lib/SubjectField.svelte';

  type Account = { did: string; handle: string };
  type ExistingReview = { rkey: string; tags: Tag[]; locale?: string };

  let {
    accounts,
    current,
    serverError,
    saved,
    demo = false,
    ondraft,
  }: {
    accounts: Account[];
    current: Account | null;
    serverError: string | null;
    saved: string | null;
    /** No `?/save` action exists off `/review`: hides the save button, error and saved link. */
    demo?: boolean;
    ondraft?: (draft: { subject: Subject | null; tags: Tag[]; locale: string }) => void;
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

  type Draft = { subject: Subject | null; subjectText: string; tags: Tag[] };
  const DRAFT_KEY = 'review-draft';

  // Signing in is a full navigation (redirect to the PDS and back), which
  // wipes every Svelte state; sessionStorage survives it. Every read/write
  // is wrapped: private browsing can throw on any storage access.
  function readDraft(): Draft | null {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      return raw ? (JSON.parse(raw) as Draft) : null;
    } catch {
      return null;
    }
  }

  function writeDraft(draft: Draft) {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* private mode, quota, etc: the draft just won't survive */
    }
  }

  function clearDraft() {
    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
  }

  // A subject shared as a link resolves the same way a typed or pasted one
  // does; only ever applied once, even if the field is cleared afterwards.
  const initialSubjectUri = page.url.searchParams.get('subject') ?? undefined;

  let subjectText = $state('');
  let subject = $state<Subject | null>(null);
  let unsupported = $state(false);
  let existing = $state(false);
  let prefilled = $state<string[]>([]);
  let tags = $state<Tag[]>([{ direction: 1, adjective: '' }]);
  let clientError = $state<string | null>(null);
  let sending = $state(false);
  let tagsEl = $state<HTMLUListElement>();

  const locale = getLocale();

  // $effect never runs during SSR, only after mount on the client: reading
  // sessionStorage here (rather than at component init, which runs on the
  // server too) means the server-rendered blank form and the client's first
  // render match, and this restore is a normal reactive update afterwards
  // rather than a hydration mismatch. `restored` gates the persist effect
  // below so it can't see the pre-restore blank state and clear a draft
  // that hasn't been read yet; declared first so it also runs first.
  let restored = $state(false);
  $effect(() => {
    if (!demo && !initialSubjectUri) {
      const draft = readDraft();
      if (draft) {
        subject = draft.subject;
        subjectText = draft.subjectText;
        tags = draft.tags;
        // Before sign-in this finds nothing (no session); restoring re-checks
        // once a session exists, in case that subject already has a saved
        // review to merge into.
        if (draft.subject) loadExisting(draft.subject.uri);
      }
    }
    restored = true;
  });

  $effect(() => {
    ondraft?.({
      subject: subject ? { ...subject, title: subjectText.trim() } : null,
      tags: tags.map((t) => ({ ...t })),
      locale,
    });
  });

  // Keeps the draft alive across the sign-in redirect; gone once it's either
  // saved or back to genuinely blank (subject cleared, nothing typed).
  $effect(() => {
    if (demo || !restored) return;
    const blank =
      subject === null &&
      subjectText.trim() === '' &&
      tags.every((t) => !t.adjective.trim());
    if (saved || blank) {
      clearDraft();
      return;
    }
    writeDraft({ subject, subjectText, tags });
  });

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

  function addTag() {
    tags = [...tags, { direction: 1, adjective: '' }];
  }

  async function addTagAndFocus() {
    addTag();
    await tick();
    [...(tagsEl?.querySelectorAll('textarea') ?? [])].at(-1)?.focus();
  }

  async function loadExisting(uri: string) {
    const res = await fetch(`/review/existing?${new URLSearchParams({ uri, locale })}`);
    const review = (await res.json()) as ExistingReview | null;
    if (subject?.uri !== uri || !review) return;
    existing = true;
    prefilled = review.tags.map((t) => t.adjective);
    if (review.tags.length === 0) return;
    // A restored draft's tags were never shown to the person as removable
    // (prefilled), so they're offered into the merge, not dropped by it;
    // an adjective the two share keeps the draft's spelling and direction.
    const offered = tags.filter((t) => t.adjective.trim() !== '');
    tags = sortTags(mergeTags(review.tags, offered, []));
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
    <span class="text">{m.thinks()}</span>

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

    <ul class="tags" bind:this={tagsEl}>
      {#each tags as tag, i (i)}
        <TagRow
          {tag}
          separator={i >= tags.length - 1 ? null : i === tags.length - 2 ? 'and' : 'comma'}
          onRemove={tags.length > 1 ? () => (tags = tags.filter((_, n) => n !== i)) : undefined}
          onnext={i === tags.length - 1 && canAdd ? addTagAndFocus : undefined}
        />
      {/each}
    </ul>

    {#if canAdd}
      <button type="button" class="plain and" onclick={addTag}>
        {m.add_another()}
      </button>
    {/if}
  </div>

  {#if unsupported}<p class="note">{m.unsupported_note()}</p>{/if}

  {#if !demo}
    <div class="actions">
      <button class="pill" class:hidden={!saveable} disabled={sending || !saveable}>
        {existing ? m.update() : m.save()}
      </button>
      {#if error}<p class="error" role="alert">{(errors[error] ?? (() => error))()}</p>{/if}
      {#if saved}
        <p class="saved">
          {m.saved()}
          <a href={`/reviews/${saved}`}>{m.view_record()}</a>
        </p>
      {/if}
    </div>
  {/if}
</form>

<style>
  /* Laid out as text, not as flex items, so the browser can balance the lines. */
  .sentence {
    font-size: var(--sentence-size, var(--step-3));
    line-height: 1.5;
    text-wrap: balance;
  }

  .tags {
    display: inline;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  /* Keyboard focus needs its own visible indicator: an underline, not the
     default outline, which would draw a box around a word and break the
     sentence. */
  .sentence .slot:focus-visible {
    outline: none;
    text-decoration: underline;
    text-decoration-color: currentColor;
    text-decoration-thickness: 0.08em;
    text-underline-offset: 0.15em;
  }

  .plain {
    font: inherit;
    letter-spacing: inherit;
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
    letter-spacing: inherit;
    color: var(--ink-soft);
    background-color: transparent;
    border: 0;
    padding: 0;
    cursor: pointer;
  }

  .handle {
    color: var(--moss-handle);
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
  /* The grammar holding the sentence together, set apart from the parts that
     carry the opinion. Baloo 2 has no italic face, so this is synthesised. */
  .text {
    font-style: italic;
  }
</style>
