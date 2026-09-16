<script lang="ts">
  import type { Subject } from '@is-not/lenses';
  import { m } from '$lib/paraglide/messages.js';
  import { resolveSubject } from '$lib/lenses';
  import { RECORD_URI, checkSubjectUri } from '$lib/review';
  import ClearButton from '$lib/ClearButton.svelte';

  let {
    subject = $bindable(null),
    text = $bindable(''),
    unsupported = $bindable(false),
    error = $bindable(null),
    initialUri,
    placeholder,
    onchosen,
    onclear,
  }: {
    subject: Subject | null;
    text: string;
    unsupported: boolean;
    error: string | null;
    initialUri?: string;
    placeholder: string;
    onchosen: (uri: string) => void;
    onclear: () => void;
  } = $props();

  type LiveCandidate =
    | { uri: string; status: 'loading' }
    | { uri: string; status: 'ready'; subject: Subject; supported: boolean };
  type ReadyCandidate = Extract<LiveCandidate, { status: 'ready' }>;

  // A canonical page can declare several at:canonical uris (array semantics),
  // so its result is a list of already-resolved candidates rather than one
  // liveCandidate: unlike an at-uri, there's no single subject to mask to
  // until the endpoint answers.
  type UrlFetch =
    | { url: string; status: 'loading' }
    | { url: string; status: 'ready'; candidates: ReadyCandidate[] };

  type Row =
    | { kind: 'clipboard' }
    | { kind: 'live-loading'; uri: string }
    | { kind: 'live-ready'; subject: Subject; supported: boolean }
    | { kind: 'item'; subject: Subject };

  const HTTP_URL = /^https?:\/\//i;

  let focused = $state(false);
  let suppressed = $state(false);
  let activeIndex = $state(-1);
  let serverItems = $state<Subject[]>([]);
  let liveCandidate = $state<LiveCandidate | null>(null);
  let urlFetch = $state<UrlFetch | null>(null);
  let pendingCommit = $state(false);
  let clipboardAffordance = $state(false);

  let clipboardChecked = false;
  let initialApplied = false;
  let liveToken = 0;
  let debounceHandle: ReturnType<typeof setTimeout> | undefined;
  let suggestAbort: AbortController | undefined;
  let urlDebounceHandle: ReturnType<typeof setTimeout> | undefined;
  let urlAbort: AbortController | undefined;
  let textareaEl = $state<HTMLTextAreaElement>();
  let listEl = $state<HTMLUListElement>();

  // Matches the page's own side padding, so a shifted list stops where the
  // sentence does rather than against the glass.
  const GUTTER = 16;

  const rows = $derived.by<Row[]>(() => {
    const list: Row[] = [];
    if (clipboardAffordance && text.trim() === '') list.push({ kind: 'clipboard' });
    if (liveCandidate?.status === 'loading') {
      list.push({ kind: 'live-loading', uri: liveCandidate.uri });
    } else if (liveCandidate?.status === 'ready') {
      list.push({ kind: 'live-ready', subject: liveCandidate.subject, supported: liveCandidate.supported });
    }
    if (urlFetch?.status === 'loading') {
      list.push({ kind: 'live-loading', uri: urlFetch.url });
    } else if (urlFetch?.status === 'ready') {
      for (const c of urlFetch.candidates) {
        list.push({ kind: 'live-ready', subject: c.subject, supported: c.supported });
      }
    }
    for (const item of serverItems) list.push({ kind: 'item', subject: item });
    return list;
  });

  const showList = $derived(focused && !suppressed && rows.length > 0);

  // An at-uri is forty unreadable characters of infrastructure, and a pasted
  // URL is no more readable, so both sit in the field masked from the moment
  // they're entered until a subject is committed: "looking…" while resolving,
  // then what it found. The value is untouched, so a failure leaves it there
  // to fix.
  const maskLabel = $derived.by(() => {
    const trimmed = text.trim();
    if (liveCandidate?.uri === trimmed) {
      return liveCandidate.status === 'loading' ? m.resolving() : liveCandidate.subject.title;
    }
    if (urlFetch?.url === trimmed) {
      if (urlFetch.status === 'loading') return m.resolving();
      return urlFetch.candidates[0]?.subject.title ?? null;
    }
    return null;
  });

  // Keeps a highlighted row whenever there's something to highlight, so Enter
  // has an obvious target without the user ever touching an arrow key.
  $effect(() => {
    if (rows.length === 0) {
      activeIndex = -1;
    } else if (activeIndex < 0 || activeIndex >= rows.length) {
      activeIndex = 0;
    }
  });

  // A typed or pasted at-uri resolves through the lens as it's typed, so the
  // suggestion is ready (or visibly loading) by the time it's chosen. A typed
  // ordinary URL instead asks the server for the page's at:canonical uris —
  // the browser can't read a third-party page itself (CORS) — debounced so a
  // URL isn't fetched once per keystroke while it's still being typed.
  $effect(() => {
    const trimmed = text.trim();
    if (trimmed === '') return; // keep any clipboard-origin candidate
    if (RECORD_URI.test(trimmed)) {
      if (liveCandidate?.uri !== trimmed) offerLive(trimmed, 'typed');
      urlFetch = null;
    } else if (HTTP_URL.test(trimmed)) {
      liveCandidate = null;
      if (urlFetch?.url !== trimmed) {
        clearTimeout(urlDebounceHandle);
        urlAbort?.abort();
        const token = ++liveToken;
        urlFetch = { url: trimmed, status: 'loading' };
        urlDebounceHandle = setTimeout(() => offerLiveUrl(trimmed, token), 200);
      }
    } else {
      liveCandidate = null;
      urlFetch = null;
    }
  });

  $effect(() => {
    const q = text.trim();
    clearTimeout(debounceHandle);
    if (q === '') {
      serverItems = [];
      return;
    }
    debounceHandle = setTimeout(() => fetchSuggestions(q), 200);
    return () => clearTimeout(debounceHandle);
  });

  $effect(() => {
    if (initialUri && !initialApplied) {
      initialApplied = true;
      const trimmed = initialUri.trim();
      text = trimmed;
      pendingCommit = true;
      offerLive(trimmed, 'typed');
    }
  });

  async function fetchSuggestions(q: string) {
    suggestAbort?.abort();
    const controller = new AbortController();
    suggestAbort = controller;
    try {
      const res = await fetch(`/review/suggest?q=${encodeURIComponent(q)}`, {
        signal: controller.signal,
      });
      // The endpoint may not exist yet in development: treat a 404 as "no suggestions".
      serverItems = res.ok ? ((await res.json()).subjects ?? []) : [];
    } catch {
      if (!controller.signal.aborted) serverItems = [];
    }
  }

  function offerLive(uri: string, source: 'typed' | 'clipboard') {
    const rejection = checkSubjectUri(uri);
    if (rejection) {
      liveCandidate = null;
      pendingCommit = false;
      if (source === 'typed') error = rejection;
      return;
    }
    if (source === 'typed') error = null;
    const token = ++liveToken;
    liveCandidate = { uri, status: 'loading' };
    resolveSubject(uri)
      .then((result) => {
        if (token !== liveToken) return;
        if ('error' in result) {
          liveCandidate = null;
          pendingCommit = false;
          if (source === 'typed') error = 'subject';
          return;
        }
        liveCandidate = { uri, status: 'ready', subject: result.subject, supported: result.supported };
        if (pendingCommit) commit(result.subject, result.supported);
      })
      .catch(() => {
        if (token !== liveToken) return;
        liveCandidate = null;
        pendingCommit = false;
        if (source === 'typed') error = 'subject';
      });
  }

  async function offerLiveUrl(rawUrl: string, token: number) {
    const controller = new AbortController();
    urlAbort = controller;
    let uris: string[];
    try {
      const res = await fetch(`/review/canonical?url=${encodeURIComponent(rawUrl)}`, {
        signal: controller.signal,
      });
      uris = res.ok ? ((await res.json()).uris ?? []) : [];
    } catch {
      if (token === liveToken) urlFetch = null;
      return;
    }
    if (token !== liveToken) return;
    if (uris.length === 0) {
      urlFetch = null;
      return;
    }
    const resolved = await Promise.all(
      uris.map(async (uri): Promise<ReadyCandidate | null> => {
        try {
          const result = await resolveSubject(uri);
          return 'error' in result
            ? null
            : { uri, status: 'ready', subject: result.subject, supported: result.supported };
        } catch {
          return null;
        }
      }),
    );
    if (token !== liveToken) return;
    const candidates = resolved.filter((c): c is ReadyCandidate => c !== null);
    urlFetch = candidates.length > 0 ? { url: rawUrl, status: 'ready', candidates } : null;
  }

  function commit(picked: Subject, supported: boolean) {
    subject = picked;
    text = picked.title;
    unsupported = !supported;
    error = null;
    liveCandidate = null;
    urlFetch = null;
    pendingCommit = false;
    suppressed = true;
    onchosen(picked.uri);
  }

  function selectRow(row: Row) {
    if (row.kind === 'clipboard') {
      pasteFromClipboard();
    } else if (row.kind === 'live-ready') {
      commit(row.subject, row.supported);
    } else if (row.kind === 'item') {
      commit(row.subject, true);
    }
    // live-loading isn't selectable yet; Enter on it is handled as "commit once ready".
    // A clicked option can take focus (and then vanish once the list updates,
    // e.g. the clipboard row); keep focus predictably on the field itself.
    textareaEl?.focus();
  }

  function rowKey(row: Row, i: number): string {
    return row.kind === 'item' ? row.subject.uri : `${row.kind}-${i}`;
  }

  async function tryClipboardOnFocus() {
    if (clipboardChecked || text.trim() !== '') return;
    clipboardChecked = true;
    try {
      if (!navigator.clipboard?.readText) throw new Error('unavailable');
      applyClipboardText(await navigator.clipboard.readText());
    } catch {
      // Denied, or Firefox (which never grants page JS a silent read): offer
      // the manual affordance instead. Never surface this as an error.
      clipboardAffordance = true;
    }
  }

  function applyClipboardText(value: string) {
    const candidate = value.trim();
    if (RECORD_URI.test(candidate) && checkSubjectUri(candidate) === null) {
      clipboardAffordance = false;
      offerLive(candidate, 'clipboard');
    }
  }

  async function pasteFromClipboard() {
    try {
      applyClipboardText(await navigator.clipboard.readText());
    } catch {
      /* Firefox blocks this even on click; nothing to surface. */
    }
  }

  function attemptCommitFromText() {
    const trimmed = text.trim();
    if (trimmed === '' || !RECORD_URI.test(trimmed) || subject?.uri === trimmed) return;
    if (liveCandidate?.status === 'ready' && liveCandidate.uri === trimmed) {
      commit(liveCandidate.subject, liveCandidate.supported);
    } else {
      pendingCommit = true;
      if (liveCandidate?.uri !== trimmed) offerLive(trimmed, 'typed');
    }
  }

  function onFocus() {
    focused = true;
    suppressed = false;
    tryClipboardOnFocus();
  }

  function onFocusOut(e: FocusEvent) {
    const container = e.currentTarget as HTMLElement;
    const next = e.relatedTarget as Node | null;
    if (next && container.contains(next)) return;
    focused = false;
    attemptCommitFromText();
  }

  function onInput() {
    suppressed = false;
  }

  function onKeydown(e: KeyboardEvent) {
    if (showList) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIndex = Math.min(activeIndex + 1, rows.length - 1);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIndex = Math.max(activeIndex - 1, 0);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        suppressed = true;
        return;
      }
      if (e.key === 'Enter' && rows[activeIndex]) {
        e.preventDefault();
        selectRow(rows[activeIndex]);
        return;
      }
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const trimmed = text.trim();
      if (trimmed !== '' && RECORD_URI.test(trimmed) && subject?.uri !== trimmed) {
        attemptCommitFromText();
        return;
      }
      // Not a uri to resolve: this is one line, so Enter submits the review.
      (e.currentTarget as HTMLElement).closest('form')?.requestSubmit();
    }
  }

  function clear() {
    subject = null;
    text = '';
    unsupported = false;
    error = null;
    liveCandidate = null;
    urlFetch = null;
    pendingCommit = false;
    onclear();
    // The × button vanishes with the subject it belonged to; don't lose focus.
    textareaEl?.focus();
  }

  // The list hangs off the field, which the sentence can leave close to the
  // right edge: unshifted it widens the document and the whole page scrolls
  // sideways. No CSS expresses "only as far as the viewport allows" without
  // anchor positioning, which Firefox and Safari don't have yet.
  $effect(() => {
    if (!showList || !listEl) return;
    listEl.style.marginInlineStart = '0px';
    const overhang = listEl.getBoundingClientRect().right - (window.innerWidth - GUTTER);
    if (overhang > 0) listEl.style.marginInlineStart = `-${Math.ceil(overhang)}px`;
  });
</script>

<span
  class="autosize subject"
  class:masked={maskLabel !== null}
  data-value={maskLabel ?? (text || placeholder)}
  onfocusout={onFocusOut}
>
  {#if maskLabel !== null}<span class="masking" aria-hidden="true">{maskLabel}</span>{/if}
  <textarea
    bind:this={textareaEl}
    bind:value={text}
    rows="1"
    spellcheck="false"
    autocapitalize="none"
    role="combobox"
    aria-expanded={showList}
    aria-controls="subject-listbox"
    aria-autocomplete="list"
    aria-activedescendant={showList && activeIndex >= 0 ? `subject-option-${activeIndex}` : undefined}
    onfocus={onFocus}
    oninput={onInput}
    onkeydown={onKeydown}
    {placeholder}
    aria-label={placeholder}
  ></textarea>
  {#if subject}
    <ClearButton label={m.remove()} onclick={clear} />
  {/if}
  {#if showList}
    <ul
      bind:this={listEl}
      id="subject-listbox"
      role="listbox"
      class="listbox"
      aria-label={placeholder}
    >
      {#each rows as row, i (rowKey(row, i))}
        <li
          id={`subject-option-${i}`}
          role="option"
          aria-selected={i === activeIndex}
          class:active={i === activeIndex}
        >
          {#if row.kind === 'clipboard'}
            <button type="button" class="option clipboard" onclick={() => selectRow(row)}>
              {m.paste_from_clipboard()}
            </button>
          {:else if row.kind === 'live-loading'}
            <span class="option loading" aria-label={m.resolving()}>
              <span class="spinner" aria-hidden="true"></span>
              <span class="uri">{row.uri}</span>
            </span>
          {:else}
            <button type="button" class="option" onclick={() => selectRow(row)}>
              {row.subject.title} <span class="type">{row.subject.type}</span>
            </button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</span>

<style>
  /* Inputs grow with what is typed: the ::after twin sets the width. */
  .autosize {
    display: inline-grid;
    max-width: 100%;
    position: relative;
    vertical-align: baseline;
  }

  .autosize::after,
  .autosize textarea {
    grid-area: 1 / 1;
    font: inherit;
    letter-spacing: inherit;
  }

  /* The hidden twin alone sets the box: a form control's intrinsic height and
     width differ per browser (Firefox sizes inputs taller than the same text),
     which would tilt the rules out of line. */
  .autosize::after {
    /* A zero-width space, not a real one: the twin must never be an empty box
       (it alone sets the height), but a trailing space would widen it and the
       rule would run on past the word. */
    content: attr(data-value) '\200b';
    visibility: hidden;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .autosize textarea {
    position: absolute;
    inset: 0;
    width: 100%;
    min-width: 0;
    resize: none;
    overflow: hidden;
    text-align: inherit;
  }

  textarea {
    font: inherit;
    letter-spacing: inherit;
    color: var(--moss-deep);
    background: none;
    border: 0;
    padding: 0;
  }

  textarea::placeholder {
    color: var(--ink-soft);
    opacity: 0.7;
  }

  /* Every part of the sentence is ruled on its own box, so they sit on one
     line however the part is built. The rule is a background, not a border, so
     thickening it on focus cannot change anyone's height; it sits a little
     above the box's bottom, nearer the letters than the font's descent. */
  .autosize {
    background-image: linear-gradient(var(--moss), var(--moss));
    background-repeat: no-repeat;
    background-size: 100% 0.07em;
    background-position: 0 calc(100% - 0.18em);
  }

  /* A box around a word would break the sentence, so focus thickens the rule. */
  textarea:focus-visible {
    outline: none;
  }

  .autosize:has(:focus-visible) {
    background-image: linear-gradient(var(--moss-deep), var(--moss-deep));
    background-size: 100% 0.16em;
  }

  /* `font: inherit` carries the font shorthand's own line-height, not the one
     the sentence cascades, so a field's box was the font's line-height while
     the words beside it are as tall as the font's real metrics. `normal` is
     those metrics. Last in the sheet because every `font` shorthand above
     resets it. */
  .autosize::after,
  .autosize textarea {
    line-height: normal;
  }

  /* The value stays in the textarea for editing and undo; only its ink goes,
     and the caret with it, so the word underneath is what reads. */
  .masked textarea {
    color: transparent;
    caret-color: transparent;
  }

  .masking {
    grid-area: 1 / 1;
    position: absolute;
    inset: 0;
    font: inherit;
    letter-spacing: inherit;
    line-height: normal;
    color: var(--ink-soft);
    pointer-events: none;
  }

  /* A dropdown panel, not a sentence word: body font, out of the text flow so
     it can never reflow or resize the sentence above it. */
  .listbox {
    position: absolute;
    top: 100%;
    left: 0;
    z-index: 1;
    margin: var(--space-2) 0 0;
    padding: var(--space-2);
    list-style: none;
    display: grid;
    gap: var(--space-1);
    min-width: max(100%, 14rem);
    max-width: min(24rem, 90vw);
    max-height: 16rem;
    overflow-y: auto;
    background: var(--paper);
    border: 1px solid var(--moss-tint);
    border-radius: 14px;
    box-shadow: var(--shadow);
    font-family: var(--font-body);
    font-size: var(--step-0);
    font-weight: 400;
    line-height: normal;
    text-align: start;
    text-wrap: initial;
    white-space: normal;
  }

  .option {
    display: block;
    width: 100%;
    padding: var(--space-2) var(--space-3);
    font: inherit;
    letter-spacing: inherit;
    color: inherit;
    text-align: start;
    background: none;
    border: 0;
    border-radius: 8px;
    cursor: pointer;
  }

  li.active .option {
    background: var(--moss-tint);
  }

  .option.loading {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    cursor: default;
    color: var(--ink-soft);
  }

  .option.clipboard {
    color: var(--moss-deep);
  }

  .type {
    font-size: var(--step--1);
    color: var(--ink-soft);
  }

  .spinner {
    width: 0.9em;
    height: 0.9em;
    flex: none;
    border-radius: 50%;
    border: 2px solid var(--moss-tint);
    border-top-color: var(--moss);
    animation: spin var(--dur-slow) linear infinite;
  }

  @media (prefers-reduced-motion: reduce) {
    .spinner {
      animation: none;
    }
  }

  @keyframes spin {
    to {
      transform: rotate(1turn);
    }
  }
</style>
