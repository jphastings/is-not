# @is-not/lenses

## 0.4.0

### Minor Changes

- fc9bcb2: buildReview accepts an optional locale and ReviewRecord carries it.

## 0.3.0

### Minor Changes

- 86f3118: buildReview replaces buildTag: one at.isnot.review record per subject with a tags array and createdAt

## 0.2.0

### Minor Changes

- c1e2376: First release: popfeed review lens, unsupported-NSID guessing, `fetchRecord` and `buildTag`.
- 6a1530e: Lenses for games.gamesgamesgamesgames.game, org.passingreads.book.registration, buzz.bookhive.book, fyi.atstore.listing.review, app.bsky.feed.post, site.standard.document, site.standard.publication, network.cosmik.card, place.stream.livestream and sh.tangled.repo. New subject types: app, publication, web-page, web-stream, code-repo. Lens documents may use `add_field` and an `extensions["at.isnot"]["title"]` path list for titles the lens can't reach.
