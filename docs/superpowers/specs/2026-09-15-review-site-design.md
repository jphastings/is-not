# Review site design: sentences, sign-in and the /review page

Turns the scaffolded site into the thing isnot.at is for: writing a review from
your own atproto account, and showing reviews as sentences. Also the advert for
the `at.isnot.review` lexicon. Product context lives in `PRODUCT.md`, visual
direction in `DESIGN.md` (seed; re-run `$impeccable document` once there is code).

Built in three stages, each its own plan and each shippable:

1. Lexicon `locale` field and the `@is-not/sentence` package.
2. Site foundation: tokens, Paraglide i18n, the homepage as a sentence and an advert.
3. atproto OAuth (several accounts) and the `/review` page.

## 1. Lexicon: `locale`

`at.isnot.review` gains an optional `locale` string with format `language`
(BCP 47). It names the language the whole review should be read in, not the
language of any one adjective. The site fills it from the browser locale.

Storage: `reviews.locale TEXT NOT NULL DEFAULT ''` in `001_init.sql` (edited in
place, nothing is deployed with data yet). The ingester stores it verbatim when
present; lexval already validates the format.

## 2. `@is-not/sentence`

A tiny, dependency-free, wasm-free package under `packages/sentence` for anyone
rendering a review as words. Published alongside `@is-not/lenses` by the same
workflow (changesets handles both).

```ts
type Part =
  | { kind: 'text'; text: string }                // connective words and spaces
  | { kind: 'who'; text: string; did: string }    // "@handle" or the self word
  | { kind: 'subject'; text: string; uri: string }
  | { kind: 'direction'; text: string; direction: Direction }
  | { kind: 'adjective'; text: string; adjective: string; direction: Direction };

type SentenceOptions = {
  locale?: string;                 // caller's locale, e.g. navigator.language
  localeMode?: 'fallback' | 'override'; // default 'fallback': review.locale wins when set
  who?: { handle: string; self?: boolean } // omit for the short form "X is Y"
};

function reviewSentence(review: ReviewRecord, opts?: SentenceOptions): Part[];
function sentenceText(parts: Part[]): string;
function sentenceHTML(parts: Part[], wrap?: Partial<Record<Part['kind'], (part) => string>>): string;
```

Rules:

- Locale resolution: `override` uses `opts.locale`; `fallback` uses
  `review.locale`, then `opts.locale`, then `en`. Unknown locales fall back to
  their language subtag, then `en`.
- Forms: with `who`, "@handle thinks X is Y"; with `who.self`, the second person
  form "You think X is Y"; without `who`, "X is Y".
- Every tag in the review is rendered. Tags are grouped by direction in the
  order 2, 1, -1, -2 and joined with `Intl.ListFormat` for the locale, so
  "X is really great, is funny and is not long". Direction 0 tags are skipped.
  Callers wanting one tag pass a review whose `tags` holds just that one.
- `sentenceText` concatenates part text. `sentenceHTML` escapes every part and
  wraps each kind with the caller's function when given (the default wraps
  nothing), so a site can turn the subject into a link and the adjective into a
  coloured span without the package knowing about markup.
- Messages per locale live in `packages/sentence/src/locales/<lang>.ts` as
  plain objects: the direction phrases, "thinks", the self word and verb form,
  and the sentence templates. English ships first; a locale is a pull request.
  An app can also register its own messages at startup with
  `registerLocale(tag, messages)` (module-level, intended to run once before
  requests are served), so adopters aren't blocked on a release.

Tests: fixtures in `packages/sentence/testdata/*.json` with `review`, `options`
and expected `text` for each supported locale, plus HTML wrapping and the
locale fallback matrix.

## 3. Site foundation

- **Tokens** in `web/src/app.css`: paper, ink and moss green with derived tints,
  a fluid type scale (ratio 1.25 or more), spacing, radii, and motion durations
  and easings. Dark scheme deferred; the paper/ink inversion is the only theme.
- **Fonts**: one chunky rounded display family and one humanist sans, both
  self-hosted under `web/static/fonts`, chosen during implementation from a real
  catalogue and outside the impeccable reflex-reject list. Fallback stacks
  always present.
- **Paraglide JS 2** with `project.inlang` at `web/`, messages in
  `web/messages/<locale>.json`, strategy `cookie`, `preferredLanguage`,
  `baseLocale`; no URL prefixes. `hooks.server.ts` runs the middleware and sets
  `lang` and `dir` on `<html>`. English only at first.
- **Homepage**: one sentence at the largest type step, rotating every fifteen
  seconds through ten random tags. Exactly one tag per sentence, in the short
  form ("The Bear is not relaxing"), with the reviewer's handle in small type
  beneath it. The swap is choreographed word by word (each part arrives with a
  short stagger); under `prefers-reduced-motion` the stagger becomes a fade and
  the rotation stops, so the sentence a reader landed on stays put. Below it, a
  single pill button to `/review`. Below the fold, the record behind the sentence
  currently on screen, shown as itself, with a one-line invitation and links to
  the lexicon file and the npm packages. Empty state remains one sentence. The
  page's `h1` is the site name, visually hidden until branding lands.
- **Sentence rendering** on the site uses `@is-not/sentence` with the short
  form on the homepage and `sentenceHTML` wrappers that link the subject and tint
  the adjective by direction.

## 4. Sign-in

`@atproto/oauth-client-node` as a confidential client:

- Client metadata served at `/oauth/client-metadata.json` and JWKS at
  `/oauth/jwks.json`. `client_id` is the metadata URL, redirect URI
  `/oauth/callback`, scope `atproto transition:generic`, DPoP bound,
  `private_key_jwt`.
- One private key from `OAUTH_PRIVATE_KEY` (a JWK JSON string). `WEB_ORIGIN`
  already exists and becomes the public origin for all URLs.
- State and session stores are tables in the site's own SQLite file at
  `SESSIONS_DATABASE_PATH` (default `web-sessions.db`, `/data/web-sessions.db`
  on Railway), opened read-write with `node:sqlite`. The shared reviews file
  stays read-only.
- Several accounts at once: a signed HTTP-only cookie holds the list of DIDs
  and the current DID. Sign-in adds; switching changes the current; sign out
  removes one. Sessions are restored per request from the store by DID.
- Routes: `POST /oauth/login` (handle → redirect), `GET /oauth/callback`,
  `POST /oauth/logout`, `POST /oauth/switch`. Local development works over
  `http://127.0.0.1` with a loopback client id per the atproto spec, so no key
  is needed to try it.

## 5. `/review`

The homepage sentence made editable. Parts:

- **who**: the current account's handle, or "Sign in" which opens the handle
  prompt inline. Other signed-in accounts are switchable from here.
- **subject**: text input accepting an at-uri. On change the page resolves it
  in the browser with `@is-not/lenses` (fetching the record from the PDS) and
  shows the title and type in the sentence. Unsupported collections show the
  best-guess title, editable, and a one-line note. App URLs are out of scope
  for this pass.
- **tags**: one row by default: a direction select (the four phrases, 0 hidden)
  and an adjective input, both styled as words in the sentence. "Add another"
  adds a row; a row can be removed down to one.
- **locale**: detected from the browser, shown as a small editable part.
- **save**: a form action. The server finds the current account's existing
  review for that subject in the shared database. If found it merges rather than
  replaces, then `putRecord`s with the same rkey and the original `createdAt`;
  otherwise it `createRecord`s with a fresh TID and both timestamps now. On
  success the sentence settles and links to the record's at-uri; failure shows
  one line and keeps the form.

  **Merge rule.** One review per subject per person, so a second opinion about
  the same thing joins the review that is already there. The form submits both
  the tags it is offering and the adjectives it was prefilled with. The server
  starts from the stored tags, drops any adjective the form was prefilled with
  and no longer offers (an explicit removal the person could see), then applies
  each offered tag: an adjective already in the review keeps its place with the
  new direction, a new one is appended. Adjectives match after trimming and
  case folding. A path that never loaded the existing review (a quick add from
  elsewhere) sends no prefilled list and so can only add or re-aim adjectives,
  never delete someone's earlier words. The merged list is capped at 32.

Validation mirrors the lexicon on the client and again on the server before the
PDS call. The record is built with `buildReview` from `@is-not/lenses`, extended
with `locale`.

## 6. Deployment

Two new Railway variables, both `preserve()`: `OAUTH_PRIVATE_KEY` and
`SESSIONS_DATABASE_PATH`. `WEB_ORIGIN` stays `https://isnot.at`. The Dockerfile
gains nothing; both databases live on the volume.

## Out of scope

Profile pages, adjective typeahead and the XRPC API, app-URL subject entry,
editing other people's reviews, dark scheme, locales beyond English.
