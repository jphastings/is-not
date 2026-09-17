# Server-side subject resolution and identifier links

## Problem

The ingester stores whatever `subject` a review record carries: title, type and
identifiers are written by the poster and shown to everyone. A malicious or merely
wrong record can rename a subject, misfile its type, or point an identifier at the
wrong thing. The lenses wasm is already embedded in the Go binary (`lens.go`) but
nothing in production calls it; identifiers are stored per review
(`review_identifiers`) and read nowhere.

The site should show links to the subject on the places that are about one subject:
a single review's page and the "all reviews of X" page. A rocksky song's page links
to it on Spotify and MusicBrainz, a book's to Open Library, Goodreads and Bookhive,
a film's to IMDb and TMDB, and so on. Those links must come from a lens run over the
subject record itself, not from the poster.

## Decisions already made

- Resolved subjects live in a new `subjects` table keyed by subject uri, shared by
  every review of that subject. One PDS fetch per subject, not per review.
- When the fetch fails or the collection has no lens, the review still lands, the
  site falls back to the poster's title and type, and the poster's identifiers are
  dropped entirely. No retry sweep: the next create or update of a review naming
  that subject tries again, which gives the poster a way to kick it.
- A review keeps the cid the poster wrote (`reviews.subject_cid`): that is the
  version of the subject the opinion was about. The `subjects` row records the cid of
  the record the lens actually ran on. When they differ, the review is marked as
  being about an earlier version of the subject.
- Existing rows are backfilled at startup, one subject at a time.
- Every identifier key with a stable public URL gets a link; brand icons are inlined
  once in a reusable component.
- The rocksky lenses stop calling their MusicBrainz id `mbid` and name what it is.

## Schema

`migrations/003_subjects.sql` (append-only, as always):

```sql
CREATE TABLE subjects (
  uri         TEXT PRIMARY KEY,
  cid         TEXT NOT NULL,   -- the record version the lens ran on
  title       TEXT NOT NULL,
  type        TEXT NOT NULL,
  resolved_at TEXT NOT NULL
);
CREATE TABLE subject_identifiers (
  uri   TEXT NOT NULL,
  key   TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (uri, key, value),
  FOREIGN KEY (uri) REFERENCES subjects (uri) ON DELETE CASCADE
);
CREATE INDEX subject_identifiers_lookup ON subject_identifiers (key, value);
DROP TABLE review_identifiers;
```

`reviews` is unchanged. `subject_title` and `subject_type` stay as the poster's
version and are the fallback when there is no `subjects` row; `subject_cid` stays as
the poster's cid. A subject whose every review is later deleted keeps its row: it is
small, correct, and saves a fetch if it is reviewed again.

## Ingest (Go)

`ingester` gains two fields: `lenses *lenses` (loaded once in `main.go` with the
existing `loadLenses`) and `fetchRecord func(ctx, uri) (cid string, record
map[string]any, err error)`, injected like `resolveHandle` so tests stub it.

`fetchRecord`'s production implementation resolves the uri's DID to its PDS through
the same `identity.Directory` that `handleResolver` builds (share the directory; it
already caches DID documents for an hour), calls
`com.atproto.repo.getRecord?repo=&collection=&rkey=` with a 10 second timeout, and
refuses bodies over 1 MiB before they reach the wasm allocator (the bound bean
ISNOT-x4bn asked for). It returns the response's `cid` and `value`.

`applyBatch` grows a step beside `resolveNewAccounts`, run before the transaction so
network time never holds the write lock:

1. Collect the `subject.uri` and `subject.cid` of every create or update commit for
   `at.isnot.review` in the batch, deduplicated by uri.
2. Skip a uri whose `subjects` row already has that cid. A poster who writes a
   bogus cid only costs us a refetch; a poster who writes our cid gets our row, which
   is already lens-derived.
3. For each remaining uri, sequentially: `fetchRecord`, then
   `lenses.resolveSubject(uri, fetchedCid, record)`. A fetch error, a lens error, or
   `supported == false` is logged at Warn and produces nothing.
4. Inside the transaction, upsert each result into `subjects` and replace its
   `subject_identifiers` rows. The identifiers written are exactly the lens's
   output. The review insert is unchanged except that the loop writing the poster's
   identifiers goes.

Fetches are sequential and unthrottled, matching handle resolution. The PDS rate
limit (3000 per 5 minutes) is far above what one jetstream batch can produce.

Stale-cid skips mean a subject is re-lensed only when a review names a cid we have
not seen. The `/review` form resolves the subject client-side before saving, so an
edit after the subject record changed upstream writes the new cid and triggers the
refetch.

### Backfill

At startup `main.go` starts one goroutine: select every distinct `subject_uri` in
`reviews` with no `subjects` row, and resolve each with the same fetch-and-lens
function, writing each result in its own short transaction. It runs concurrently
with ingest; the single connection serialises the writes and a backfill write only
ever delays a batch by one small transaction. Sequential, no pause between subjects.
Subjects that resolve are never looked at again; one that cannot (no lens, dead
PDS, deleted record) is retried on every boot.

### Tests

`ingest_test.go`, behavioural, with `fetchRecord` stubbed:

- A review whose subject fetch returns a rocksky song record yields a `subjects` row
  with the lens title and type, `subject_identifiers` holding the lens's keys, and
  no trace of the identifiers the poster wrote.
- A fetch error still inserts the review and writes no `subjects` row.
- A second review of the same subject with the same cid does not call `fetchRecord`;
  one with a different cid does and overwrites the row.
- An unsupported collection writes no row.

## Lenses package

`app.rocksky.song.json` renames its identifier `mbid` to `musicbrainzRecordingId`.
For consistency `app.rocksky.album.json` becomes `musicbrainzReleaseId` and
`app.rocksky.artist.json` becomes `musicbrainzArtistId`, though the vendored album
and artist lexicons carry no `mbid` field today so those entries map nothing until
rocksky adds one. Fixtures under `testdata/app.rocksky.song/` change to match.
`docs/creating-a-lens.md` gains a line: name an identifier after what the id
addresses (`musicbrainzRecordingId`, not `mbid`), and check `identifierLinks.ts` on
the web side so the new key gets a link. A changeset bumps `@is-not/lenses` minor.

Popfeed passes its identifiers object through untouched (`imdbId`, `tmdbId`,
`tmdbTvSeriesId`, `isbn10`, `isbn13`, `asin`, `mbReleaseId`, `igdbId`, ...), so the
link table on the web side speaks both vocabularies rather than the lens rewriting
popfeed's keys.

## Web

### Reading

Every query in `web/src/lib/server/db.ts` that selects `r.subject_title` and
`r.subject_type` gains `LEFT JOIN subjects s ON s.uri = r.subject_uri` and selects
`COALESCE(s.title, r.subject_title)`, `COALESCE(s.type, r.subject_type)`,
`s.cid AS resolved_cid`, and the identifiers as one JSON column:

```sql
(SELECT json_group_array(json_object('key', i.key, 'value', i.value))
 FROM subject_identifiers i WHERE i.uri = r.subject_uri) AS identifiers
```

The `type` filter and `subjectTypesFor` compare against the coalesced type so the
filter pills and the rows agree. `ListedReview.subject` becomes the package's
`Subject` (which already has optional `identifiers`), and `ListedReview` gains
`stale: boolean`, true when `resolved_cid` is present and differs from
`subject_cid`. The live-PDS fallback in `liveReview.ts` has no `subjects` row, so it
yields no identifiers and `stale: false`.

Because `ReviewRow` posts `review.subject` back when a review is edited, an edit now
writes the lens-derived title, type and identifiers into the record. That is the
right direction: the record gets more accurate, and the ingester ignores it anyway.

### Links

`web/src/lib/identifierLinks.ts` exports `identifierLinks(subject): Link[]` where
`Link = { href: string; brand: Brand; label: string }`, a pure table from identifier
key (and, where needed, subject type) to URL:

| key | URL | brand |
|---|---|---|
| `spotifyTrackId` | `https://open.spotify.com/track/{v}` | spotify |
| `spotifyAlbumId` | `https://open.spotify.com/album/{v}` | spotify |
| `musicbrainzRecordingId` | `https://musicbrainz.org/recording/{v}` | musicbrainz |
| `musicbrainzReleaseId`, `mbReleaseId` | `https://musicbrainz.org/release/{v}` | musicbrainz |
| `musicbrainzArtistId` | `https://musicbrainz.org/artist/{v}` | musicbrainz |
| `imdbId` | `https://www.imdb.com/title/{v}` | imdb |
| `tmdbId` | `https://www.themoviedb.org/tv/{v}` when type starts `tv-`, else `/movie/{v}` | tmdb |
| `tmdbTvSeriesId` | `https://www.themoviedb.org/tv/{v}` | tmdb |
| `isbn13`, else `isbn10` | `https://openlibrary.org/isbn/{v}` (one link, isbn13 preferred) | openlibrary |
| `goodreadsId` | `https://www.goodreads.com/book/show/{v}` | goodreads |
| `hiveId` | `https://bookhive.buzz/books/{v}` | bookhive |
| `steam` | `https://store.steampowered.com/app/{v}` | steam |
| `asin` | `https://www.amazon.com/dp/{v}` | amazon |

Keys with no id-addressable public page produce nothing: `igdb`/`igdbId` (the IGDB
site addresses games by slug and answers 403 to a numeric path), `externalId`,
`other`, `mbId` (deprecated upstream), `parentMbReleaseId` (the containing album;
a second MusicBrainz link would confuse more than it helps). Values are
URL-encoded as a path segment. Order of output follows the table above so the same
subject always lists its links the same way.

`web/src/lib/BrandIcon.svelte` takes `brand` and renders one inline SVG from a map
of Simple Icons paths (CC0, copied in, no dependency), each with its brand colour
as a CSS custom property so a brand whose colour dies on the dark ground (Goodreads
brown, Steam black) can be given a `light-dark()` pair. Bookhive and Open Library
have no Simple Icon; they get a small generic glyph in `--ink`. The SVG is
`display: block` with the button-baseline rule from CLAUDE.md in mind.

`web/src/lib/SubjectLinks.svelte` takes a `Subject` and renders `identifierLinks`
as a horizontal list of icon-only anchors, each with an `aria-label` and `title`
of the form "Open on Spotify" (paraglide message with a `{site}` parameter),
`rel="external"`. It renders nothing for an empty list.

It appears in two places:

- The single review page, inside `SentenceHero`'s actions slot beside the "review it
  yourself" pill.
- The subject listing page, under the `<h1>` title.

Listing rows do not get links; a row is about the opinion, the page is about the
subject.

### Earlier-version note

When `review.stale` is true, the single review page shows, under the sentence in
`--ink-soft` at body size, a small warning glyph and the message "This review was of
an earlier version of the subject" (paraglide key `review_earlier_version`).
`ReviewRow` shows only the glyph, with the same text as its `title`, next to the
permalink icon. The glyph is a plain outlined triangle in `currentColor`, no second
signal colour.

### Tests

- `identifierLinks.test.ts`: TMDB picks tv for `tv-show`, movie for `movie`; isbn13
  wins over isbn10 and only one Open Library link appears; unknown keys yield
  nothing; values are encoded.
- `db.test.ts`: a review with a `subjects` row lists the resolved title, type and
  identifiers; one without lists the poster's title and no identifiers; `stale`
  flips on a cid mismatch; the `type` filter matches the resolved type.

## Docs and housekeeping

- `README.md`: the tables list gains `subjects` and `subject_identifiers`; the
  ingest description says subjects are lensed server-side from the fetched record.
- `CLAUDE.md`: one entry under "Things that cost time": the site never shows a
  poster's identifiers; links come from `subjects`, written by the ingester's lens
  run, so a missing link means the fetch or lens failed for that subject (check the
  ingester log), and updating the review retries it. Adding a link for a new key is
  a row in `identifierLinks.ts` plus, if it is a new brand, a path in
  `BrandIcon.svelte`.
- Bean ISNOT-x4bn loses its "canonical rule for title/type" note: `subjects` is the
  rule now. The XRPC `resolveSubject` endpoint remains its own piece of work.
- No `Dockerfile` or Railway change: the wasm and migrations are already embedded.

## Out of scope

- The XRPC `at.isnot.resolveSubject` endpoint (bean ISNOT-x4bn).
- Changing what the `/review` form writes into the record.
- Re-resolving a subject on a schedule; only a new cid triggers it.
- Links in listing rows.
