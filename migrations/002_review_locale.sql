-- The language the whole review is meant to be read in. Added after the first
-- deploy, so it lives here rather than in 001.
ALTER TABLE reviews ADD COLUMN locale TEXT NOT NULL DEFAULT '';
