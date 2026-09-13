package main

import (
	"path/filepath"
	"testing"
)

func TestOpenDBMigratesOnceAndIsRepeatable(t *testing.T) {
	path := filepath.Join(t.TempDir(), "test.db")
	for range 2 {
		db, err := openDB(path)
		if err != nil {
			t.Fatal(err)
		}
		var n int
		if err := db.QueryRow(`SELECT COUNT(*) FROM schema_version`).Scan(&n); err != nil {
			t.Fatal(err)
		}
		if n != 1 {
			t.Fatalf("schema_version rows = %d, want 1", n)
		}
		if _, err := db.Exec(`SELECT did, rkey, subject_uri, subject_cid, adjective, direction, updated_at FROM tags`); err != nil {
			t.Fatal(err)
		}
		db.Close()
	}
}
