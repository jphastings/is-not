CREATE TABLE reviews (
  did                 TEXT NOT NULL,
  rkey                TEXT NOT NULL,
  subject_uri         TEXT NOT NULL,
  subject_cid         TEXT NOT NULL,
  subject_title       TEXT NOT NULL,
  subject_type        TEXT NOT NULL,
  locale              TEXT NOT NULL DEFAULT '',
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  PRIMARY KEY (did, rkey)
);
CREATE INDEX reviews_subject ON reviews (subject_uri);
CREATE TABLE review_tags (
  did       TEXT NOT NULL,
  rkey      TEXT NOT NULL,
  adjective TEXT NOT NULL,
  direction INTEGER NOT NULL CHECK (direction BETWEEN -2 AND 2),
  PRIMARY KEY (did, rkey, adjective),
  FOREIGN KEY (did, rkey) REFERENCES reviews (did, rkey) ON DELETE CASCADE
);
CREATE INDEX review_tags_adjective ON review_tags (adjective);
CREATE TABLE review_identifiers (
  did   TEXT NOT NULL,
  rkey  TEXT NOT NULL,
  key   TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (did, rkey, key, value),
  FOREIGN KEY (did, rkey) REFERENCES reviews (did, rkey) ON DELETE CASCADE
);
CREATE INDEX review_identifiers_lookup ON review_identifiers (key, value);
CREATE TABLE accounts (
  did        TEXT PRIMARY KEY,
  handle     TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
CREATE TABLE cursor (id INTEGER PRIMARY KEY CHECK (id = 1), seq INTEGER NOT NULL);
