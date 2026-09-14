CREATE TABLE tags (
  did                 TEXT NOT NULL,
  rkey                TEXT NOT NULL,
  subject_uri         TEXT NOT NULL,
  subject_cid         TEXT NOT NULL,
  subject_title       TEXT NOT NULL,
  subject_type        TEXT NOT NULL,
  adjective           TEXT NOT NULL,
  direction           INTEGER NOT NULL CHECK (direction BETWEEN -2 AND 2),
  updated_at          TEXT NOT NULL,
  PRIMARY KEY (did, rkey)
);
CREATE INDEX tags_subject ON tags (subject_uri);
CREATE INDEX tags_adjective ON tags (adjective);
CREATE TABLE tag_identifiers (
  did   TEXT NOT NULL,
  rkey  TEXT NOT NULL,
  key   TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (did, rkey, key, value),
  FOREIGN KEY (did, rkey) REFERENCES tags (did, rkey) ON DELETE CASCADE
);
CREATE INDEX tag_identifiers_lookup ON tag_identifiers (key, value);
CREATE TABLE accounts (
  did        TEXT PRIMARY KEY,
  handle     TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
CREATE TABLE cursor (id INTEGER PRIMARY KEY CHECK (id = 1), seq INTEGER NOT NULL);
