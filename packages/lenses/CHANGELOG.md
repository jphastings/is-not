# @is-not/lenses

## 0.7.0

### Minor Changes

- 88037e6: Lenses for app.rocksky.song, app.rocksky.album, and app.rocksky.artist, so rocksky.app tracks, albums, and artists can be review subjects. Adds a `titleTemplate` extension (title from two source fields, e.g. "{title} ({artist})") and extends the `identifiers` extension to accept an explicit key-to-source-field map, including extracting a URL's last path segment when it follows a given segment (e.g. a Spotify track id from `/track/<id>`).

## 0.6.0

### Minor Changes

- 34a90b2: Lens for buzz.bookhive.catalogBook, so a BookHive catalog record can be a review subject.

## 0.5.0

### Minor Changes

- f69489b: Lens for fyi.atstore.listing.detail, so an AT Store app listing can be a review subject.

### Patch Changes

- 9cdb305: Cache DID-document lookups per DID, so resolving many records from one repo fetches its PDS once.

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
