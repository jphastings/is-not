-- One row per reviewed subject, written by the ingester from a lens run over
-- the subject record itself. cid is the version the lens saw; a review's own
-- subject_cid says which version its opinion was about.
CREATE TABLE subjects (
  uri         TEXT PRIMARY KEY,
  cid         TEXT NOT NULL,
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
-- Poster-supplied identifiers are never shown; the lens's live in subject_identifiers.
DROP TABLE review_identifiers;
