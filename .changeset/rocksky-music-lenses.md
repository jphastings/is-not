---
"@is-not/lenses": minor
---

Lenses for app.rocksky.song, app.rocksky.album, and app.rocksky.artist, so rocksky.app tracks, albums, and artists can be review subjects. Adds a `titleTemplate` extension (title from two source fields, e.g. "{title} ({artist})") and extends the `identifiers` extension to accept an explicit key-to-source-field map, including extracting a URL's last path segment when it follows a given segment (e.g. a Spotify track id from `/track/<id>`).
