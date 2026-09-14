# @is-not/sentence

Renders an `at.isnot.review` record as a sentence in a given locale — as
typed `Part`s, plain text, or HTML. `Review` is a structural subset of
`@is-not/lenses`'s `ReviewRecord`, so a record from `buildReview` can be
passed straight in without depending on that package.

## Install

```sh
pnpm add @is-not/sentence
```

## Usage

```ts
import { reviewSentence, sentenceText, sentenceHTML, type Part } from '@is-not/sentence';

const review = {
  subject: { uri: 'at://did:plc:x/buzz.bookhive.book/1', title: 'Piranesi' },
  tags: [{ direction: 2, adjective: 'strange' }],
};

const parts = reviewSentence(review, { who: { handle: 'jp.example', did: 'did:plc:jp' } });

sentenceText(parts);
// "@jp.example thinks Piranesi is really strange"

sentenceHTML(parts, {
  subject: (html, part) => `<a href="${part.kind === 'subject' ? part.uri : ''}">${html}</a>`,
  adjective: (html) => `<em>${html}</em>`,
});
// '@jp.example thinks <a href="at://did:plc:x/buzz.bookhive.book/1">Piranesi</a> is really <em>strange</em>'
```

`reviewSentence` groups tags by direction (really/is/is not/really isn't),
joins adjectives within a group and the groups themselves using the
locale's `Intl.ListFormat`, and resolves the locale via `resolveLocale`
(review locale, then `options.locale`, falling back through the language
subtag to `en`; pass `localeMode: 'override'` to force `options.locale`).

## Adding a locale

Apps can register their own translations at runtime with `registerLocale('fr', messages)`; a locale shipped in the package is a pull request.

Add a `Messages` object under `src/locales/`, following the shape in
`src/locales/en.ts`, and register it in the `locales` map in `src/index.ts`.
Add fixtures under `testdata/<locale>/` mirroring `testdata/en/` — the
fixtures are the contract that `src/index.test.ts` runs against.
