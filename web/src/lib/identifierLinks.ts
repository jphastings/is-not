import type { Subject } from '@is-not/lenses';

export type Brand =
  | 'spotify'
  | 'musicbrainz'
  | 'imdb'
  | 'tmdb'
  | 'openlibrary'
  | 'goodreads'
  | 'bookhive'
  | 'steam'
  | 'amazon';

export const BRAND_SITES: Record<Brand, string> = {
  spotify: 'Spotify',
  musicbrainz: 'MusicBrainz',
  imdb: 'IMDb',
  tmdb: 'TMDB',
  openlibrary: 'Open Library',
  goodreads: 'Goodreads',
  bookhive: 'Bookhive',
  steam: 'Steam',
  amazon: 'Amazon',
};

export type Link = { href: string; brand: Brand; site: string };

type Rule = { keys: string[]; brand: Brand; url: (value: string, type: string) => string };

// One row per public page an identifier can address, in display order. Keys with
// no id-addressable page (igdb, igdbId, mbId, externalId, other, parentMbReleaseId)
// have no row.
const RULES: Rule[] = [
  { keys: ['spotifyTrackId'], brand: 'spotify', url: (v) => `https://open.spotify.com/track/${v}` },
  { keys: ['spotifyAlbumId'], brand: 'spotify', url: (v) => `https://open.spotify.com/album/${v}` },
  {
    keys: ['musicbrainzRecordingId'],
    brand: 'musicbrainz',
    url: (v) => `https://musicbrainz.org/recording/${v}`,
  },
  {
    keys: ['musicbrainzReleaseId', 'mbReleaseId'],
    brand: 'musicbrainz',
    url: (v) => `https://musicbrainz.org/release/${v}`,
  },
  {
    keys: ['musicbrainzArtistId'],
    brand: 'musicbrainz',
    url: (v) => `https://musicbrainz.org/artist/${v}`,
  },
  { keys: ['imdbId'], brand: 'imdb', url: (v) => `https://www.imdb.com/title/${v}` },
  {
    keys: ['tmdbId'],
    brand: 'tmdb',
    url: (v, type) => `https://www.themoviedb.org/${type.startsWith('tv-') ? 'tv' : 'movie'}/${v}`,
  },
  { keys: ['tmdbTvSeriesId'], brand: 'tmdb', url: (v) => `https://www.themoviedb.org/tv/${v}` },
  {
    keys: ['isbn13', 'isbn10'],
    brand: 'openlibrary',
    url: (v) => `https://openlibrary.org/isbn/${v}`,
  },
  {
    keys: ['goodreadsId'],
    brand: 'goodreads',
    url: (v) => `https://www.goodreads.com/book/show/${v}`,
  },
  { keys: ['hiveId'], brand: 'bookhive', url: (v) => `https://bookhive.buzz/books/${v}` },
  { keys: ['steam'], brand: 'steam', url: (v) => `https://store.steampowered.com/app/${v}` },
  { keys: ['asin'], brand: 'amazon', url: (v) => `https://www.amazon.com/dp/${v}` },
];

/** Public pages for a subject, one per rule, from its lens-derived identifiers.
    A rule listing several keys takes the first one present, so isbn13 beats isbn10. */
export function identifierLinks(subject: Pick<Subject, 'type' | 'identifiers'>): Link[] {
  const values = new Map((subject.identifiers ?? []).map((id) => [id.key, id.value]));
  const links: Link[] = [];
  for (const rule of RULES) {
    const key = rule.keys.find((k) => values.has(k));
    if (key === undefined) continue;
    links.push({
      href: rule.url(encodeURIComponent(values.get(key)!), subject.type),
      brand: rule.brand,
      site: BRAND_SITES[rule.brand],
    });
  }
  return links;
}
