# Locale field and `@is-not/sentence` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the optional `locale` field to `at.isnot.review` end to end, and ship `@is-not/sentence`, the package that turns a review record into a sentence in a locale.

**Architecture:** The lexicon gains one optional string; the ingester stores it in a new `reviews.locale` column. `packages/sentence` is a dependency-free TypeScript package mirroring `packages/lenses` (Vite+ pack, vitest, changesets) that builds an array of typed sentence parts from a review, with plain-text and HTML renderers. Both are covered by the existing CI workflow.

**Tech Stack:** Go 1.26 + modernc sqlite + atmos lexval (root); TypeScript, Vite+ (`vp pack`, `vp test`), `Intl.ListFormat` (packages/sentence); changesets; GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-15-review-site-design.md` sections 1 and 2.

## Global Constraints

- Commit straight to `main`; run `go test ./...` and `pnpm check` before every commit. No test summaries in commit messages. No attribution lines.
- `migrations/001_init.sql` is edited in place (nothing is deployed with data).
- Keep tests behavioral and concise; comments only where code is counter-intuitive.
- The sentence package has no runtime dependencies and never touches the wasm.
- Copy in every locale is short; English is the only locale shipped now.
- Direction phrases in English are exactly: 2 "is really", 1 "is", -1 "is not", -2 "really isn't". Direction 0 is never rendered.
- Locale resolution: `override` uses the caller's locale; `fallback` (default) uses the review's locale, then the caller's, then `en`. An unsupported tag falls back to its language subtag, then `en`.

---

### Task 1: `locale` in the lexicon, schema and ingester

**Files:**
- Modify: `lexicons/at/isnot/review.json`
- Modify: `migrations/001_init.sql`
- Modify: `ingest.go` (applyCommit insert and upsert)
- Modify: `ingest_test.go`
- Modify: `docs/superpowers/specs/2026-09-13-ingest-design.md` (lexicon table and schema block)
- Modify: `README.md` (Lexicon section, one clause)

**Interfaces:**
- Produces: `reviews.locale TEXT NOT NULL DEFAULT ''`; records may carry `locale` (BCP 47 string, lexicon format `language`).

- [ ] **Step 1: Add the field to the lexicon**

In `lexicons/at/isnot/review.json`, add to `defs.main.record.properties` (after `tags`; `required` is unchanged):

```json
"locale": {
  "type": "string",
  "format": "language",
  "description": "The language the whole review is meant to be read in (BCP 47), not the language of any one adjective. Readers may render the sentence in this locale."
}
```

- [ ] **Step 2: Write the failing tests**

Add to `ingest_test.go`, next to `reviewRecord`:

```go
func withLocale(record map[string]any, locale string) map[string]any {
	record["locale"] = locale
	return record
}

func storedLocale(t *testing.T, db *sql.DB, rkey string) string {
	t.Helper()
	var locale string
	if err := db.QueryRow(`SELECT locale FROM reviews WHERE rkey = ?`, rkey).Scan(&locale); err != nil {
		t.Fatal(err)
	}
	return locale
}

func TestFoldStoresLocaleAndDefaultsToEmpty(t *testing.T) {
	in := newTestIngester(t)
	apply(t, in, 1,
		commitEvent("did:plc:a", "r1", jetstream.OpCreate, withLocale(reviewRecord(oneTag("good", 1), validTime, validTime), "en-GB")),
		commitEvent("did:plc:a", "r2", jetstream.OpCreate, reviewRecord(oneTag("good", 1), validTime, validTime)),
	)
	if got := storedLocale(t, in.db, "r1"); got != "en-GB" {
		t.Fatalf("locale = %q, want en-GB", got)
	}
	if got := storedLocale(t, in.db, "r2"); got != "" {
		t.Fatalf("locale = %q, want empty", got)
	}
	apply(t, in, 2, commitEvent("did:plc:a", "r1", jetstream.OpUpdate, reviewRecord(oneTag("good", 1), validTime, validTime)))
	if got := storedLocale(t, in.db, "r1"); got != "" {
		t.Fatalf("locale after update without one = %q, want empty", got)
	}
}

func TestFoldRejectsMalformedLocale(t *testing.T) {
	in := newTestIngester(t)
	apply(t, in, 1, commitEvent("did:plc:a", "r1", jetstream.OpCreate, withLocale(reviewRecord(oneTag("good", 1), validTime, validTime), "not a language tag")))
	if reviewExists(t, in.db, "did:plc:a", "r1") {
		t.Fatal("review with a malformed locale was stored")
	}
}
```

Use the existing helper names in the file (`newTestIngester`, `commitEvent`, `reviewRecord`, `oneTag`, `validTime`, `reviewExists`); if a name differs, match the file, not this plan.

- [ ] **Step 3: Run the tests to see them fail**

Run: `go test ./... -run 'TestFoldStoresLocale|TestFoldRejectsMalformedLocale'`
Expected: FAIL (no `locale` column / malformed locale accepted).

- [ ] **Step 4: Schema and ingester**

In `migrations/001_init.sql`, add `locale TEXT NOT NULL DEFAULT '',` to `reviews` after `subject_type`.

In `ingest.go` `applyCommit`, read the locale and include it in the upsert:

```go
locale, _ := c.Record["locale"].(string)
```

and in the SQL: add `locale` to the column list and a `?` bound to `locale` after `subject_type`, plus `locale = excluded.locale,` in the `ON CONFLICT` set list.

- [ ] **Step 5: Run the full suite**

Run: `gofmt -l . && go vet ./... && go test ./...`
Expected: gofmt prints nothing; all tests pass. Malformed locale is rejected by `lexval.ValidateRecord` because the lexicon format is `language`.

- [ ] **Step 6: Docs**

In `docs/superpowers/specs/2026-09-13-ingest-design.md`, add a `locale` row to the lexicon table (optional, string, format language) and the column to the schema block. In `README.md`'s Lexicon section, append "and an optional locale" to the sentence describing a review.

- [ ] **Step 7: Commit**

```bash
git add lexicons migrations ingest.go ingest_test.go docs/superpowers/specs/2026-09-13-ingest-design.md README.md
git commit -m "feat: optional locale on at.isnot.review

The language the whole review is meant to be read in, stored alongside
the subject so readers can render the sentence in it."
```

---

### Task 2: `@is-not/sentence` package

**Files:**
- Create: `packages/sentence/package.json`
- Create: `packages/sentence/vite.config.ts`
- Create: `packages/sentence/tsconfig.json`
- Create: `packages/sentence/README.md`
- Create: `packages/sentence/src/index.ts`
- Create: `packages/sentence/src/locales/en.ts`
- Create: `packages/sentence/src/index.test.ts`
- Create: `packages/sentence/testdata/en/*.json` (six fixtures listed below)
- Modify: `pnpm-lock.yaml` (via `pnpm install`)

**Interfaces:**
- Produces: `reviewSentence(review, options?) => Part[]`, `sentenceText(parts) => string`, `sentenceHTML(parts, wrap?) => string`, `resolveLocale(reviewLocale, options?) => string`, types `Part`, `Direction`, `Tag`, `Review`, `Who`, `SentenceOptions`, `Messages`.
- `Review` is a structural subset of `@is-not/lenses`'s `ReviewRecord` (`subject.uri`, `subject.title`, `tags`, optional `locale`), so a record from `buildReview` is accepted without a dependency.

- [ ] **Step 1: Package scaffold**

`packages/sentence/package.json`:

```json
{
  "name": "@is-not/sentence",
  "version": "0.1.0",
  "description": "Render an at.isnot.review record as a sentence in a locale, as text, HTML or typed parts",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/jphastings/is-not.git",
    "directory": "packages/sentence"
  },
  "files": ["dist"],
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "publishConfig": { "access": "public" },
  "scripts": {
    "build": "vp pack",
    "test": "vp test --run"
  },
  "devDependencies": {
    "@types/node": "^26.5.1",
    "vite-plus": "^0.2.7"
  },
  "engines": { "node": ">=20" }
}
```

`packages/sentence/vite.config.ts`:

```ts
import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    platform: 'neutral',
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
```

`packages/sentence/tsconfig.json`: copy `packages/lenses/tsconfig.json` verbatim.

Then run `pnpm install` from the repo root.

- [ ] **Step 2: Fixtures (the contract) and the failing test**

Create these files under `packages/sentence/testdata/en/`. Each has `review`, optional `options`, expected `text`, and optional `html` (the HTML expected when the test wraps `subject` in `<a href="{uri}">` and `adjective` in `<em>`).

`short.json`:

```json
{
  "review": { "subject": { "uri": "at://did:plc:x/social.popfeed.feed.review/1", "title": "The Bear" }, "tags": [{ "direction": -1, "adjective": "relaxing" }] },
  "text": "The Bear is not relaxing",
  "html": "<a href=\"at://did:plc:x/social.popfeed.feed.review/1\">The Bear</a> is not <em>relaxing</em>"
}
```

`who.json`:

```json
{
  "review": { "subject": { "uri": "at://did:plc:x/buzz.bookhive.book/1", "title": "Piranesi" }, "tags": [{ "direction": 2, "adjective": "strange" }] },
  "options": { "who": { "handle": "jp.example", "did": "did:plc:jp" } },
  "text": "@jp.example thinks Piranesi is really strange"
}
```

`self.json`:

```json
{
  "review": { "subject": { "uri": "at://did:plc:x/buzz.bookhive.book/1", "title": "Piranesi" }, "tags": [{ "direction": 1, "adjective": "short" }] },
  "options": { "who": { "handle": "jp.example", "did": "did:plc:jp", "self": true } },
  "text": "You think Piranesi is short"
}
```

`groups.json` (grouping by direction in the order 2, 1, -1, -2; adjectives within a group and the groups themselves joined with the locale's conjunction list format; direction 0 skipped):

```json
{
  "review": { "subject": { "uri": "at://did:plc:x/app.bsky.feed.post/1", "title": "Dune: Part Two" }, "tags": [
    { "direction": 1, "adjective": "loud" },
    { "direction": -1, "adjective": "long" },
    { "direction": 0, "adjective": "funny" },
    { "direction": 2, "adjective": "beautiful" },
    { "direction": 1, "adjective": "sandy" },
    { "direction": -2, "adjective": "boring" }
  ] },
  "text": "Dune: Part Two is really beautiful, is loud and sandy, is not long, and really isn't boring"
}
```

`locale-fallback.json` (review locale `xx-YY` is unsupported and has no supported language subtag, caller offers `en-GB`):

```json
{
  "review": { "subject": { "uri": "at://x/y/1", "title": "It" }, "tags": [{ "direction": 1, "adjective": "scary" }], "locale": "xx-YY" },
  "options": { "locale": "en-GB" },
  "text": "It is scary"
}
```

`escaping.json` (HTML output escapes every part):

```json
{
  "review": { "subject": { "uri": "at://x/y/1", "title": "Tom & Jerry <3" }, "tags": [{ "direction": 1, "adjective": "\"classic\"" }] },
  "text": "Tom & Jerry <3 is \"classic\"",
  "html": "<a href=\"at://x/y/1\">Tom &amp; Jerry &lt;3</a> is <em>&quot;classic&quot;</em>"
}
```

`packages/sentence/src/index.test.ts`:

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vite-plus/test';
import { resolveLocale, reviewSentence, sentenceHTML, sentenceText, type Part } from './index.ts';

const wrap = {
  subject: (html: string, part: Part) => `<a href="${part.kind === 'subject' ? part.uri : ''}">${html}</a>`,
  adjective: (html: string) => `<em>${html}</em>`,
};

const root = join(import.meta.dirname, '..', 'testdata');
for (const locale of readdirSync(root)) {
  describe(locale, () => {
    for (const file of readdirSync(join(root, locale))) {
      it(file, () => {
        const fixture = JSON.parse(readFileSync(join(root, locale, file), 'utf8'));
        const parts = reviewSentence(fixture.review, fixture.options);
        expect(sentenceText(parts)).toBe(fixture.text);
        if (fixture.html) expect(sentenceHTML(parts, wrap)).toBe(fixture.html);
      });
    }
  });
}

describe('resolveLocale', () => {
  it('prefers the review locale unless overridden', () => {
    expect(resolveLocale('en', { locale: 'fr' })).toBe('en');
    expect(resolveLocale('en', { locale: 'fr', localeMode: 'override' })).toBe('fr');
  });
  it('falls back through language subtag to en', () => {
    expect(resolveLocale('en-NZ')).toBe('en');
    expect(resolveLocale('xx-YY', { locale: 'zz' })).toBe('en');
    expect(resolveLocale(undefined)).toBe('en');
  });
});

describe('parts', () => {
  it('types every piece of the sentence', () => {
    const parts = reviewSentence(
      { subject: { uri: 'at://x/y/1', title: 'It' }, tags: [{ direction: -1, adjective: 'dull' }] },
      { who: { handle: 'a.b', did: 'did:plc:a' } },
    );
    expect(parts.map((p) => p.kind)).toEqual(['who', 'text', 'subject', 'text', 'direction', 'text', 'adjective']);
  });
});
```

Note: `resolveLocale('en-NZ')` resolves to `en` because only `en` has messages; once `en-NZ` messages exist it would resolve to itself.

- [ ] **Step 3: Run the tests to see them fail**

Run: `pnpm --filter @is-not/sentence test`
Expected: FAIL (module `./index.ts` has no exports).

- [ ] **Step 4: English messages**

`packages/sentence/src/locales/en.ts`:

```ts
import type { Messages } from '../index.ts';

export const en: Messages = {
  thinks: 'thinks',
  self: 'You',
  selfThinks: 'think',
  directions: { 2: 'is really', 1: 'is', '-1': 'is not', '-2': "really isn't" },
};
```

- [ ] **Step 5: Implementation**

`packages/sentence/src/index.ts`:

```ts
import { en } from './locales/en.ts';

export type Direction = -2 | -1 | 0 | 1 | 2;
export type Tag = { direction: Direction; adjective: string };
export type Review = {
  subject: { uri: string; title: string };
  tags: Tag[];
  locale?: string;
};
export type Who = { handle: string; did: string; self?: boolean };
export type SentenceOptions = {
  locale?: string;
  localeMode?: 'fallback' | 'override';
  who?: Who;
};
export type Part =
  | { kind: 'text'; text: string }
  | { kind: 'who'; text: string; did: string }
  | { kind: 'subject'; text: string; uri: string }
  | { kind: 'direction'; text: string; direction: Direction }
  | { kind: 'adjective'; text: string; adjective: string; direction: Direction };
export type Messages = {
  thinks: string;
  self: string;
  selfThinks: string;
  directions: Record<'2' | '1' | '-1' | '-2', string>;
};

const locales: Record<string, Messages> = { en };
const order: Direction[] = [2, 1, -1, -2];

export function resolveLocale(reviewLocale: string | undefined, options: SentenceOptions = {}): string {
  const candidates =
    options.localeMode === 'override' ? [options.locale] : [reviewLocale, options.locale];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const tag = candidate.toLowerCase();
    if (locales[tag]) return tag;
    const language = tag.split('-')[0];
    if (locales[language]) return language;
  }
  return 'en';
}

export function reviewSentence(review: Review, options: SentenceOptions = {}): Part[] {
  const locale = resolveLocale(review.locale, options);
  const m = locales[locale];
  const list = new Intl.ListFormat(locale, { type: 'conjunction' });
  const parts: Part[] = [];

  if (options.who) {
    const { handle, did, self } = options.who;
    parts.push(
      { kind: 'who', text: self ? m.self : `@${handle}`, did },
      { kind: 'text', text: ` ${self ? m.selfThinks : m.thinks} ` },
    );
  }
  parts.push({ kind: 'subject', text: review.subject.title, uri: review.subject.uri }, { kind: 'text', text: ' ' });

  const groups = order
    .map((direction) => ({ direction, tags: review.tags.filter((t) => t.direction === direction) }))
    .filter((g) => g.tags.length > 0)
    .map(({ direction, tags }): Part[] => [
      { kind: 'direction', text: m.directions[String(direction) as keyof Messages['directions']], direction },
      { kind: 'text', text: ' ' },
      ...joinParts(
        list,
        tags.map((t) => ({ kind: 'adjective', text: t.adjective, adjective: t.adjective, direction }) as Part),
      ),
    ]);
  parts.push(...joinParts(list, groups));
  return parts;
}

// Uses the locale's list formatting ("a, b and c") while keeping every item a typed part.
function joinParts(list: Intl.ListFormat, items: (Part | Part[])[]): Part[] {
  const out: Part[] = [];
  let i = 0;
  for (const piece of list.formatToParts(items.map((_, n) => String(n)))) {
    if (piece.type === 'element') {
      const item = items[i++];
      out.push(...(Array.isArray(item) ? item : [item]));
    } else {
      out.push({ kind: 'text', text: piece.value });
    }
  }
  return out;
}

export function sentenceText(parts: Part[]): string {
  return parts.map((p) => p.text).join('');
}

export type Wrap = Partial<Record<Part['kind'], (html: string, part: Part) => string>>;

export function sentenceHTML(parts: Part[], wrap: Wrap = {}): string {
  return parts
    .map((part) => {
      const html = escape(part.text);
      const fn = wrap[part.kind];
      return fn ? fn(html, part) : html;
    })
    .join('');
}

function escape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
```

Implementation notes for whoever transcribes this:
- `Intl.ListFormat.formatToParts` on `['0','1','2']` yields elements in order, so `i++` maps them back. Don't rely on the placeholder strings' values.
- In `groups.json` the expected text puts a comma before the final "and" between groups ("is not long, and really isn't boring") only if the runtime's `en` list format does so for four items; Node 24's ICU gives "a, b, c, and d" for four items and "a, b and c" for three. Run the test and fix the fixture text to what ICU produces, but keep the adjectives-within-a-group and groups-joined structure. Record the exact output in the fixture; the fixture is the contract.

- [ ] **Step 6: Run the tests**

Run: `pnpm --filter @is-not/sentence test`
Expected: PASS. If `groups.json` differs only in the Oxford comma, update the fixture as described.

- [ ] **Step 7: Build and check**

Run: `pnpm --filter @is-not/sentence build && ls packages/sentence/dist && pnpm check`
Expected: `index.js` and `index.d.ts` in `dist`; check passes (fix formatting with `vp check --fix` if needed).

- [ ] **Step 8: README**

`packages/sentence/README.md`: name, one paragraph on what it does, install line, a usage example showing `reviewSentence` with `who`, `sentenceText`, and `sentenceHTML` with a subject link wrapper, a short section "Adding a locale" pointing at `src/locales/en.ts` and the fixtures directory. Under 60 lines.

- [ ] **Step 9: Commit**

```bash
git add packages/sentence pnpm-lock.yaml
git commit -m "feat(sentence): @is-not/sentence renders a review as typed parts, text or HTML

Grouped by direction, joined with the locale's list format, with the
who/thinks form, the second-person self form and the short form."
```

---

### Task 3: Lenses record type, CI and changesets

**Files:**
- Modify: `packages/lenses/src/index.ts` (`ReviewRecord`, `buildReview`)
- Modify: `packages/lenses/src/index.test.ts`
- Modify: `.github/workflows/lenses.yml`
- Create: `.changeset/sentence-package.md`, `.changeset/lenses-locale.md`
- Modify: `.gitignore` (add `packages/sentence/dist/`)
- Modify: `CLAUDE.md`, `README.md` (architecture bullet for the packages)

**Interfaces:**
- Consumes: `ReviewRecord` from Task 0 state; `@is-not/sentence` from Task 2.
- Produces: `ReviewRecord.locale?: string`; `buildReview(lenses, { uri, tags, locale? }, fetchImpl?)`.

- [ ] **Step 1: Failing test**

In `packages/lenses/src/index.test.ts`, extend the `buildReview` test: pass `locale: 'en-GB'` and assert `record.locale === 'en-GB'`; add a second call without `locale` and assert `'locale' in record` is false.

- [ ] **Step 2: Run it**

Run: `pnpm --filter @is-not/lenses exec vp test --run`
Expected: FAIL on the locale assertion.

- [ ] **Step 3: Implement**

In `packages/lenses/src/index.ts`: add `locale?: string;` to `ReviewRecord`; in `buildReview` accept `locale?: string` in the second argument and spread `...(locale ? { locale } : {})` into the record. Update the doc comment.

- [ ] **Step 4: Run it**

Run: `pnpm --filter @is-not/lenses exec vp test --run`
Expected: PASS.

- [ ] **Step 5: CI and release**

In `.github/workflows/lenses.yml`:
- add `'packages/sentence/**'` to both `paths` lists;
- in the `test` job after the lenses test step add:
  ```yaml
      - run: pnpm --filter @is-not/sentence build
      - run: pnpm --filter @is-not/sentence test
  ```
- in the `release` job after `pnpm --filter @is-not/lenses build` add `- run: pnpm --filter @is-not/sentence build`.

Add `packages/sentence/dist/` to `.gitignore`.

- [ ] **Step 6: Changesets**

`.changeset/sentence-package.md`:

```md
---
'@is-not/sentence': minor
---

First release: reviewSentence, sentenceText and sentenceHTML with English messages.
```

`.changeset/lenses-locale.md`:

```md
---
'@is-not/lenses': minor
---

buildReview accepts an optional locale and ReviewRecord carries it.
```

- [ ] **Step 7: Docs**

`README.md` architecture: add a bullet for `packages/sentence` (render a review as a sentence; published as `@is-not/sentence`). `CLAUDE.md` "Where things are": note that the first publish of a new npm package must be done by JP by hand (`pnpm publish` in the package dir) before trusted publishing can take over, as with lenses.

- [ ] **Step 8: Verify everything**

Run: `pnpm check && pnpm test && go test ./...`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add packages/lenses .github/workflows/lenses.yml .changeset .gitignore README.md CLAUDE.md
git commit -m "feat(lenses): optional locale on buildReview; CI and release cover @is-not/sentence"
```
