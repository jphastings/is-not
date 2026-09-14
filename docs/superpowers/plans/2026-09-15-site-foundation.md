# Site Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `web/` its visual system, i18n, and a homepage that is a review sentence and an advert for the lexicon.

**Architecture:** Design tokens and self-hosted fonts in `app.css`; Paraglide JS 2 for messages with cookie and Accept-Language detection; the homepage renders reviews through `@is-not/sentence` with a choreographed word-by-word swap. The site must still run from `web/build` alone (no `node_modules`), so workspace packages and fonts are bundled.

**Tech Stack:** SvelteKit 2 + Svelte 5 runes, adapter-node (`WEB_` env prefix), Vite+, Paraglide JS 2, `@fontsource-variable/baloo-2`, `@fontsource-variable/atkinson-hyperlegible-next`, `@is-not/sentence` (workspace).

**Spec:** `docs/superpowers/specs/2026-09-15-review-site-design.md` section 3; `PRODUCT.md`; `DESIGN.md`.

## Global Constraints

- Commit straight to `main`; run `pnpm check`, `pnpm --filter web test`, `pnpm --filter web check` before every commit.
- `web/` runs with zero `node_modules` at runtime: every dependency is a devDependency and is bundled into `web/build`. The smoke test in Task 3 proves it.
- Colour: one moss green plus paper and ink. Direction is never conveyed by colour alone.
- Type: Baloo 2 (display) and Atkinson Hyperlegible Next (body), self-hosted via fontsource, with fallback stacks. Fluid scale, ratio at least 1.25.
- Motion: ease-out curves, no bounce; every sequence reduces to a fade under `prefers-reduced-motion`.
- Copy through Paraglide messages only; English only; few words.
- Banned: cards for the sake of it, gradient text, glass, side-stripe borders, hero-metric layouts, em dashes in copy.

---

### Task 1: Tokens, fonts and app shell

**Files:**
- Create: `web/src/app.css`
- Modify: `web/src/app.html` (`%lang%`, `%dir%` placeholders on `<html>`; keep the rest)
- Modify: `web/src/routes/+layout.svelte` (import `app.css`, set `<html>` class? no: only the favicon head link stays)
- Modify: `web/package.json` (devDependencies)
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces: CSS custom properties `--paper`, `--ink`, `--ink-soft`, `--moss`, `--moss-deep`, `--moss-tint`, `--font-display`, `--font-body`, `--step--1` … `--step-5`, `--space-1` … `--space-8`, `--radius-pill`, `--ease-out`, `--dur-fast`, `--dur-slow`; utility class `.display` (display face, tight leading) and `.pill` (button/link).

- [ ] **Step 1: Install fonts**

Run from the repo root:

```bash
pnpm --filter web add -D @fontsource-variable/baloo-2 @fontsource-variable/atkinson-hyperlegible-next
```

- [ ] **Step 2: Write `web/src/app.css`**

```css
@import '@fontsource-variable/baloo-2';
@import '@fontsource-variable/atkinson-hyperlegible-next';

:root {
	--paper: oklch(97% 0.02 95);
	--ink: oklch(22% 0.03 140);
	--ink-soft: oklch(45% 0.03 140);
	--moss: oklch(52% 0.11 145);
	--moss-deep: oklch(38% 0.1 145);
	--moss-tint: oklch(92% 0.05 145);

	--font-display: 'Baloo 2 Variable', 'Arial Rounded MT Bold', ui-rounded, system-ui, sans-serif;
	--font-body: 'Atkinson Hyperlegible Next Variable', system-ui, sans-serif;

	/* fluid modular scale, ratio 1.25 at 320px growing to 1.333 at 1280px */
	--step--1: clamp(0.8rem, 0.78rem + 0.1vw, 0.9rem);
	--step-0: clamp(1rem, 0.95rem + 0.25vw, 1.2rem);
	--step-1: clamp(1.25rem, 1.15rem + 0.5vw, 1.6rem);
	--step-2: clamp(1.56rem, 1.4rem + 0.8vw, 2.13rem);
	--step-3: clamp(1.95rem, 1.7rem + 1.3vw, 2.84rem);
	--step-4: clamp(2.44rem, 2rem + 2.2vw, 3.79rem);
	--step-5: clamp(3.05rem, 2.3rem + 3.8vw, 5.06rem);

	--space-1: 0.25rem;
	--space-2: 0.5rem;
	--space-3: 0.75rem;
	--space-4: 1rem;
	--space-5: 1.5rem;
	--space-6: 2.5rem;
	--space-7: 4rem;
	--space-8: 6.5rem;

	--radius-pill: 999px;
	--ease-out: cubic-bezier(0.22, 1, 0.36, 1);
	--dur-fast: 180ms;
	--dur-slow: 600ms;

	color-scheme: light;
}

html {
	background: var(--paper);
	color: var(--ink);
	font-family: var(--font-body);
	font-size: var(--step-0);
	line-height: 1.5;
	-webkit-text-size-adjust: 100%;
}

body {
	margin: 0;
	min-height: 100dvh;
}

.display {
	font-family: var(--font-display);
	font-weight: 700;
	line-height: 1.1;
	letter-spacing: -0.01em;
	text-wrap: balance;
	overflow-wrap: anywhere;
}

.pill {
	display: inline-flex;
	align-items: center;
	gap: var(--space-2);
	padding: var(--space-3) var(--space-5);
	border: 0;
	border-radius: var(--radius-pill);
	background: var(--moss);
	color: var(--paper);
	font: inherit;
	font-family: var(--font-display);
	font-weight: 700;
	font-size: var(--step-1);
	text-decoration: none;
	cursor: pointer;
	transition: background var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out);
}
.pill:hover {
	background: var(--moss-deep);
}
.pill:active {
	transform: translateY(1px);
}

:focus-visible {
	outline: 3px solid var(--moss);
	outline-offset: 3px;
	border-radius: 4px;
}

@media (prefers-reduced-motion: reduce) {
	*,
	*::before,
	*::after {
		transition-duration: 1ms !important;
		animation-duration: 1ms !important;
	}
}
```

- [ ] **Step 3: App shell**

`web/src/app.html`: change `<html lang="en">` to `<html lang="%lang%" dir="%dir%">`. Task 2's hook fills these; until then they render literally, which is fine for this commit.

`web/src/routes/+layout.svelte`:

```svelte
<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
```

- [ ] **Step 4: Verify**

Run: `pnpm --filter web build && pnpm --filter web check && pnpm check`
Expected: build succeeds and the font files appear under `web/build/client/_app/immutable/assets/`; checks pass.

- [ ] **Step 5: Commit**

```bash
git add web pnpm-lock.yaml
git commit -m "feat(web): design tokens, self-hosted Baloo 2 and Atkinson Hyperlegible Next"
```

---

### Task 2: Paraglide i18n

**Files:**
- Create: `web/project.inlang/settings.json`
- Create: `web/messages/en.json`
- Create: `web/src/hooks.server.ts`
- Modify: `web/vite.config.ts` (plugin)
- Modify: `web/package.json` (devDependency `@inlang/paraglide-js`)
- Modify: `web/.gitignore` (`/src/lib/paraglide`)
- Modify: `web/src/routes/+page.svelte` (use messages for the empty state and title)

**Interfaces:**
- Produces: `import { m } from '$lib/paraglide/messages.js'` with keys `site_title`, `empty_state`, `say_something`, `for_developers`, `record_invite`, `lexicon_link`, `packages_link`; `import { getLocale } from '$lib/paraglide/runtime.js'`.

- [ ] **Step 1: Install and configure**

```bash
pnpm --filter web add -D @inlang/paraglide-js
```

`web/project.inlang/settings.json`:

```json
{
	"$schema": "https://inlang.com/schema/project-settings",
	"baseLocale": "en",
	"locales": ["en"],
	"modules": [
		"https://cdn.jsdelivr.net/npm/@inlang/plugin-message-format@4/dist/index.js",
		"https://cdn.jsdelivr.net/npm/@inlang/plugin-m-function-matcher@2/dist/index.js"
	],
	"plugin.inlang.messageFormat": {
		"pathPattern": "./messages/{locale}.json"
	}
}
```

`web/messages/en.json`:

```json
{
	"$schema": "https://inlang.com/schema/inlang-message-format",
	"site_title": "is/not",
	"empty_state": "Nobody has said anything yet.",
	"say_something": "Say something",
	"for_developers": "One record, in the reviewer's own repo.",
	"record_invite": "Read it, write it, show it in your app.",
	"lexicon_link": "the lexicon",
	"packages_link": "the packages"
}
```

`web/vite.config.ts`: add the plugin after `sveltekit()`:

```ts
import { paraglideVitePlugin } from '@inlang/paraglide-js';
// ...
plugins: [
	sveltekit({ /* unchanged */ }),
	paraglideVitePlugin({
		project: './project.inlang',
		outdir: './src/lib/paraglide',
		strategy: ['cookie', 'preferredLanguage', 'baseLocale'],
	}),
],
```

Add `/src/lib/paraglide` to `web/.gitignore` (generated on build/dev).

- [ ] **Step 2: Server hook**

`web/src/hooks.server.ts`:

```ts
import type { Handle } from '@sveltejs/kit';
import { paraglideMiddleware } from '$lib/paraglide/server';

export const handle: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) => {
		event.request = request;
		return resolve(event, {
			transformPageChunk: ({ html }) => html.replace('%lang%', locale).replace('%dir%', 'ltr'),
		});
	});
```

(`dir` becomes locale-aware when an RTL locale is added; `ltr` is correct for `en`.)

- [ ] **Step 3: Use a message**

In `web/src/routes/+page.svelte`, import `{ m }` from `$lib/paraglide/messages.js` and replace the literal `is/not` title and `Nobody has said anything yet.` with `{m.site_title()}` and `{m.empty_state()}`.

- [ ] **Step 4: Verify**

Run: `pnpm --filter web build && pnpm --filter web test && pnpm --filter web check && pnpm check`
Expected: all pass; `web/src/lib/paraglide/` exists and is ignored by git (`git status` shows nothing under it).

Then smoke: `WEB_PORT=3999 DATABASE_PATH=/nonexistent.db node web/build &`, `curl -s -H 'Accept-Language: en-GB' localhost:3999 | grep -o '<html lang="[^"]*"'` prints `<html lang="en"` and the page contains the empty-state text; kill the server.

- [ ] **Step 5: Commit**

```bash
git add web pnpm-lock.yaml
git commit -m "feat(web): Paraglide messages with cookie and Accept-Language detection"
```

---

### Task 3: Homepage as a sentence and an advert

**Files:**
- Modify: `web/package.json` (devDependency `"@is-not/sentence": "workspace:*"`)
- Modify: `web/src/lib/server/db.ts` (query returns whole reviews)
- Modify: `web/src/lib/server/db.test.ts`
- Delete: `web/src/lib/tags.ts`
- Create: `web/src/lib/Sentence.svelte`
- Modify: `web/src/routes/+page.server.ts`
- Modify: `web/src/routes/+page.svelte`
- Modify: `web/vite.config.ts` (`ssr.noExternal` if the smoke test needs it)

**Interfaces:**
- Consumes: `reviewSentence`, `Part`, `Review` from `@is-not/sentence`; `m` from Paraglide.
- Produces: `randomReviews(limit = 10): HomeReview[]` where `HomeReview = { did: string; handle: string; rkey: string; subject: { uri: string; title: string }; tags: { direction: Direction; adjective: string }[]; locale?: string }`; `Sentence.svelte` props `{ parts: Part[]; animate?: boolean }`.

- [ ] **Step 1: Failing test for `randomReviews`**

Rewrite `web/src/lib/server/db.test.ts` so the temp database has `reviews` (with `locale` column) and `review_tags`; insert two reviews for a known did (one with two tags, one with a single direction-0 tag) and one review for an unknown did with one tag. Assert: `randomReviews()` returns two reviews (the review whose only tag is direction 0 is absent), the two-tag review's `tags` has length 2 in insertion order is not required, the unknown did's `handle` is `''`, and `locale` is `'en'` for the review inserted with locale `'en'` and `undefined` for the one inserted with `''`.

- [ ] **Step 2: Implement `randomReviews`**

`web/src/lib/server/db.ts`: keep the lazy read-only `DatabaseSync` open. Query:

```sql
SELECT r.did, r.rkey, COALESCE(a.handle, '') AS handle, r.subject_uri, r.subject_title, r.locale,
       t.adjective, t.direction
FROM reviews r
JOIN review_tags t ON t.did = r.did AND t.rkey = r.rkey AND t.direction != 0
LEFT JOIN accounts a ON a.did = r.did
WHERE (r.did, r.rkey) IN (
  SELECT r2.did, r2.rkey FROM reviews r2
  WHERE EXISTS (SELECT 1 FROM review_tags t2 WHERE t2.did = r2.did AND t2.rkey = r2.rkey AND t2.direction != 0)
  ORDER BY random() LIMIT ?
)
ORDER BY r.did, r.rkey
```

Group rows by `(did, rkey)` into `HomeReview` objects; `locale` is `undefined` when the column is empty. Remove `randomTags` and `web/src/lib/tags.ts`; `Direction` now comes from `@is-not/sentence`.

- [ ] **Step 3: Run the test**

Run: `pnpm --filter web test`
Expected: PASS.

- [ ] **Step 4: `Sentence.svelte`**

```svelte
<script lang="ts">
	import { fly } from 'svelte/transition';
	import type { Part } from '@is-not/sentence';

	let { parts, animate = true }: { parts: Part[]; animate?: boolean } = $props();
	const stagger = 45;
</script>

<span class="sentence">
	{#each parts as part, i (i)}
		{#if part.kind === 'text'}
			<span>{part.text}</span>
		{:else}
			<span
				class={part.kind}
				class:not={part.kind === 'adjective' && part.direction < 0}
				in:fly|global={{ y: 12, duration: animate ? 420 : 0, delay: animate ? i * stagger : 0, easing: (t) => 1 - Math.pow(1 - t, 4) }}
				>{part.text}</span
			>
		{/if}
	{/each}
</span>

<style>
	.sentence {
		display: inline;
	}
	.sentence > span {
		display: inline-block;
		white-space: pre-wrap;
	}
	.subject {
		color: var(--moss-deep);
	}
	.adjective {
		background: var(--moss-tint);
		border-radius: 0.2em;
		padding: 0 0.15em;
	}
	.adjective.not {
		background: transparent;
		text-decoration: underline;
		text-decoration-color: var(--moss);
		text-decoration-thickness: 0.08em;
		text-underline-offset: 0.12em;
	}
	@media (prefers-reduced-motion: reduce) {
		.sentence > span {
			transition: none;
		}
	}
</style>
```

Direction is carried by the words ("is not"); the underline vs tint on the adjective reinforces it without being the only signal.

- [ ] **Step 5: Homepage**

`web/src/routes/+page.server.ts`: `load` returns `{ reviews: randomReviews() }`.

`web/src/routes/+page.svelte`:

```svelte
<script lang="ts">
	import { reviewSentence } from '@is-not/sentence';
	import { m } from '$lib/paraglide/messages.js';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import Sentence from '$lib/Sentence.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let i = $state(0);
	const current = $derived(data.reviews[i]);
	const parts = $derived(current ? reviewSentence(current, { locale: getLocale() }) : []);
	const example = $derived(data.reviews[0]);

	$effect(() => {
		if (data.reviews.length < 2) return;
		const id = setInterval(() => (i = (i + 1) % data.reviews.length), 15000);
		return () => clearInterval(id);
	});
</script>

<svelte:head>
	<title>{m.site_title()}</title>
</svelte:head>

<main>
	<section class="hero">
		<h1 class="display">
			{#if current}
				{#key i}
					<Sentence {parts} />
				{/key}
			{:else}
				{m.empty_state()}
			{/if}
		</h1>
		<a class="pill" href="/review">{m.say_something()}</a>
	</section>

	{#if example}
		<section class="record">
			<h2 class="display">{m.for_developers()}</h2>
			<pre><code>{JSON.stringify({ $type: 'at.isnot.review', subject: example.subject, tags: example.tags, locale: example.locale, createdAt: '…', updatedAt: '…' }, null, 2)}</code></pre>
			<p>
				{m.record_invite()}
				<a href="https://github.com/jphastings/is-not/blob/main/lexicons/at/isnot/review.json">{m.lexicon_link()}</a>
				·
				<a href="https://www.npmjs.com/org/is-not">{m.packages_link()}</a>
			</p>
		</section>
	{/if}
</main>

<style>
	main {
		padding: var(--space-5);
		max-width: 60rem;
		margin-inline: auto;
	}
	.hero {
		min-height: 88dvh;
		display: grid;
		align-content: center;
		gap: var(--space-6);
	}
	h1 {
		font-size: var(--step-5);
		margin: 0;
	}
	.hero .pill {
		justify-self: start;
	}
	.record {
		padding-block: var(--space-8);
		display: grid;
		gap: var(--space-4);
	}
	h2 {
		font-size: var(--step-2);
		margin: 0;
	}
	pre {
		margin: 0;
		padding: var(--space-4);
		background: var(--moss-tint);
		border-radius: 12px;
		overflow-x: auto;
		font-size: var(--step--1);
	}
	.record a {
		color: var(--moss-deep);
		font-weight: 600;
	}
</style>
```

Note the sentence uses the short form (no `who`) on the homepage, per the spec. The `$type`/timestamps in the example are illustrative; the real values are not stored in the site's query.

- [ ] **Step 6: Bundling check**

Run: `pnpm --filter web build`, then copy `web/build` to a temp dir outside the repo and start it there: `cp -r web/build /tmp/isnot-web && (cd /tmp && WEB_PORT=3999 DATABASE_PATH=/nonexistent.db node isnot-web &)`; `curl -s localhost:3999` must return the page (status 200, contains the empty-state text). If Node fails to resolve `@is-not/sentence` or a fontsource import, add `ssr: { noExternal: ['@is-not/sentence', /@fontsource/] }` to `web/vite.config.ts` and rebuild. Kill the server and remove the temp copy.

- [ ] **Step 7: Browser evidence**

Run `pnpm --filter web dev` against a database with a few reviews (create one with the ingest test helpers, or point `DATABASE_PATH` at a copy of a database that has rows). Screenshot the homepage at 400px and 1280px widths, with and without rows. Check: the sentence wraps without overflow at 400px with a 30-character title, focus rings are visible on the pill and links, the rotation swaps word by word, `prefers-reduced-motion` gives a plain fade. Record findings in the report; fix anything material before committing.

- [ ] **Step 8: Verify and commit**

Run: `pnpm check && pnpm --filter web test && pnpm --filter web check`

```bash
git add web pnpm-lock.yaml
git commit -m "feat(web): homepage renders reviews as a sentence and shows the record"
```
