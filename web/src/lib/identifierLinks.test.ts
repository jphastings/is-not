import { describe, expect, it } from 'vite-plus/test';
import { identifierLinks } from './identifierLinks';

const ids = (...pairs: [string, string][]) => pairs.map(([key, value]) => ({ key, value }));

describe('identifierLinks', () => {
  it('links a rocksky song to Spotify and MusicBrainz, in table order', () => {
    const links = identifierLinks({
      type: 'music-track',
      identifiers: ids(
        ['musicbrainzRecordingId', '1e4bfb4b-2fe5-469d-986d-f6c0adb11a44'],
        ['spotifyTrackId', '5lE2EFXt4muvLFMGQg4hZN'],
      ),
    });
    expect(links).toEqual([
      {
        href: 'https://open.spotify.com/track/5lE2EFXt4muvLFMGQg4hZN',
        brand: 'spotify',
        site: 'Spotify',
      },
      {
        href: 'https://musicbrainz.org/recording/1e4bfb4b-2fe5-469d-986d-f6c0adb11a44',
        brand: 'musicbrainz',
        site: 'MusicBrainz',
      },
    ]);
  });

  it('sends a tmdbId to the tv or movie page by subject type', () => {
    const tv = identifierLinks({ type: 'tv-show', identifiers: ids(['tmdbId', '95396']) });
    const film = identifierLinks({ type: 'movie', identifiers: ids(['tmdbId', '575265']) });
    expect(tv[0].href).toBe('https://www.themoviedb.org/tv/95396');
    expect(film[0].href).toBe('https://www.themoviedb.org/movie/575265');
  });

  it('makes one Open Library link, preferring isbn13', () => {
    const both = identifierLinks({
      type: 'book',
      identifiers: ids(['isbn10', '0765378000'], ['isbn13', '9780765378002']),
    });
    expect(both.map((l) => l.href)).toEqual(['https://openlibrary.org/isbn/9780765378002']);
    const only10 = identifierLinks({ type: 'book', identifiers: ids(['isbn10', '0765378000']) });
    expect(only10.map((l) => l.href)).toEqual(['https://openlibrary.org/isbn/0765378000']);
  });

  it('ignores keys with no public page and encodes values', () => {
    expect(
      identifierLinks({
        type: 'video-game',
        identifiers: ids(['igdb', '406928'], ['externalId', '42'], ['steam', '46 59']),
      }),
    ).toEqual([
      { href: 'https://store.steampowered.com/app/46%2059', brand: 'steam', site: 'Steam' },
    ]);
    expect(identifierLinks({ type: 'post' })).toEqual([]);
  });
});
