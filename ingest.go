package main

import (
	"context"
	"database/sql"
	"embed"
	"errors"
	"io/fs"
	"log/slog"
	"strings"
	"time"

	"github.com/bluesky-social/jetstream"
	"github.com/jcalabro/atmos"
	"github.com/jcalabro/atmos/lexicon"
	"github.com/jcalabro/atmos/lexval"
)

const collection = "at.isnot.review"

//go:embed lexicons
var lexiconFS embed.FS

func loadCatalog() (*lexicon.Catalog, error) {
	cat := lexicon.NewCatalog()
	err := fs.WalkDir(lexiconFS, "lexicons", func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.HasSuffix(p, ".json") {
			return err
		}
		data, err := lexiconFS.ReadFile(p)
		if err != nil {
			return err
		}
		schema, err := lexicon.Parse(data)
		if err != nil {
			return err
		}
		return cat.Add(schema)
	})
	if err != nil {
		return nil, err
	}
	return cat, cat.Resolve()
}

type ingester struct {
	db            *sql.DB
	cat           *lexicon.Catalog
	log           *slog.Logger
	resolveHandle func(ctx context.Context, did string) (string, error)
}

func (in *ingester) run(ctx context.Context, client *jetstream.Client) error {
	for batch, err := range client.Events(ctx) {
		if err != nil {
			if errors.Is(err, jetstream.ErrFatal) {
				return err
			}
			in.log.Warn("stream error", "err", err)
			continue
		}
		if err := in.applyBatch(context.WithoutCancel(ctx), batch.Events(), batch.LastCursor()); err != nil {
			return err
		}
	}
	return nil
}

func (in *ingester) applyBatch(ctx context.Context, events []jetstream.Event, cursor uint64) error {
	// Resolve before the transaction so network time never holds the write lock.
	newAccounts, err := in.resolveNewAccounts(ctx, events)
	if err != nil {
		return err
	}
	tx, err := in.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	now := time.Now().UTC().Format(atmos.AtprotoDatetimeLayout)
	for did, handle := range newAccounts {
		if _, err := tx.Exec(`INSERT INTO accounts (did, handle, updated_at) VALUES (?, ?, ?) ON CONFLICT (did) DO NOTHING`, did, handle, now); err != nil {
			return err
		}
	}
	for _, evt := range events {
		if err := in.apply(tx, evt); err != nil {
			return err
		}
	}
	if cursor > 0 {
		if _, err := tx.Exec(`INSERT INTO cursor (id, seq) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET seq = MAX(seq, excluded.seq)`, cursor); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// resolveNewAccounts returns handles for DIDs that create or update a tag in this
// batch and have no accounts row yet. A failed lookup yields an empty handle.
func (in *ingester) resolveNewAccounts(ctx context.Context, events []jetstream.Event) (map[string]string, error) {
	handles := map[string]string{}
	seen := map[string]bool{}
	for _, evt := range events {
		if evt.Kind != jetstream.KindCommit || evt.Commit.Collection != collection || evt.Commit.Operation == jetstream.OpDelete {
			continue
		}
		if seen[evt.DID] {
			continue
		}
		seen[evt.DID] = true
		var exists bool
		if err := in.db.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM accounts WHERE did = ?)`, evt.DID).Scan(&exists); err != nil {
			return nil, err
		}
		if exists {
			continue
		}
		resolveCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
		handle, err := in.resolveHandle(resolveCtx, evt.DID)
		cancel()
		if err != nil {
			in.log.Warn("handle resolution failed", "did", evt.DID, "err", err)
			handle = ""
		}
		handles[evt.DID] = handle
	}
	return handles, nil
}

func (in *ingester) apply(tx *sql.Tx, evt jetstream.Event) error {
	switch evt.Kind {
	case jetstream.KindCommit:
		return in.applyCommit(tx, evt.DID, evt.Commit)
	case jetstream.KindAccount:
		if evt.Account.Active || evt.Account.Status != "deleted" {
			return nil
		}
		_, err := tx.Exec(`DELETE FROM reviews WHERE did = ?`, evt.DID)
		return err
	case jetstream.KindSync:
		// Replacement records follow as their own commits, so drop the stale view.
		_, err := tx.Exec(`DELETE FROM reviews WHERE did = ?`, evt.DID)
		return err
	case jetstream.KindIdentity:
		if evt.Identity.Handle == "" {
			return nil
		}
		handle := evt.Identity.Handle
		// The relay sends this sentinel when an account no longer verifiably controls its handle.
		if atmos.Handle(handle).IsInvalidHandle() {
			handle = ""
		}
		updatedAt := time.Now().UTC().Format(atmos.AtprotoDatetimeLayout)
		if t, err := time.Parse(time.RFC3339Nano, evt.Identity.Time); err == nil {
			updatedAt = t.UTC().Format(atmos.AtprotoDatetimeLayout)
		}
		_, err := tx.Exec(`INSERT INTO accounts (did, handle, updated_at) VALUES (?, ?, ?)
			ON CONFLICT (did) DO UPDATE SET handle = excluded.handle, updated_at = excluded.updated_at`,
			evt.DID, handle, updatedAt)
		return err
	}
	return nil
}

func (in *ingester) applyCommit(tx *sql.Tx, did string, c *jetstream.Commit) error {
	if c.Collection != collection {
		return nil
	}
	if c.Operation == jetstream.OpDelete {
		_, err := tx.Exec(`DELETE FROM reviews WHERE did = ? AND rkey = ?`, did, c.Rkey)
		return err
	}
	createdAt, updatedAt, err := validTimestamps(in.cat, c.Record)
	if err != nil {
		in.log.Warn("invalid record, deleting any existing row", "did", did, "rkey", c.Rkey, "err", err)
		_, err := tx.Exec(`DELETE FROM reviews WHERE did = ? AND rkey = ?`, did, c.Rkey)
		return err
	}
	subject := c.Record["subject"].(map[string]any)
	_, err = tx.Exec(`
		INSERT INTO reviews (did, rkey, subject_uri, subject_cid, subject_title, subject_type, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT (did, rkey) DO UPDATE SET
			subject_uri   = excluded.subject_uri,
			subject_cid   = excluded.subject_cid,
			subject_title = excluded.subject_title,
			subject_type  = excluded.subject_type,
			created_at    = excluded.created_at,
			updated_at    = excluded.updated_at`,
		did, c.Rkey, subject["uri"], subject["cid"], subject["title"], subject["type"], createdAt, updatedAt)
	if err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM review_tags WHERE did = ? AND rkey = ?`, did, c.Rkey); err != nil {
		return err
	}
	for _, t := range c.Record["tags"].([]any) {
		m := t.(map[string]any)
		if _, err := tx.Exec(`INSERT OR REPLACE INTO review_tags (did, rkey, adjective, direction) VALUES (?, ?, ?, ?)`,
			did, c.Rkey, m["adjective"], m["direction"]); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(`DELETE FROM review_identifiers WHERE did = ? AND rkey = ?`, did, c.Rkey); err != nil {
		return err
	}
	if ids, ok := subject["identifiers"].([]any); ok {
		for _, id := range ids {
			m := id.(map[string]any)
			if _, err := tx.Exec(`INSERT OR IGNORE INTO review_identifiers (did, rkey, key, value) VALUES (?, ?, ?, ?)`,
				did, c.Rkey, m["key"], m["value"]); err != nil {
				return err
			}
		}
	}
	return nil
}

// validTimestamps validates the record against the lexicon, then normalises
// createdAt and updatedAt to fixed-width UTC so TEXT ordering in the reviews
// table is chronological.
func validTimestamps(cat *lexicon.Catalog, record map[string]any) (createdAt, updatedAt string, err error) {
	if err := lexval.ValidateRecord(cat, collection, record); err != nil {
		return "", "", err
	}
	if createdAt, err = normaliseDatetime(record["createdAt"]); err != nil {
		return "", "", err
	}
	if updatedAt, err = normaliseDatetime(record["updatedAt"]); err != nil {
		return "", "", err
	}
	return createdAt, updatedAt, nil
}

func normaliseDatetime(v any) (string, error) {
	t, err := time.Parse(time.RFC3339Nano, v.(string))
	if err != nil {
		return "", err
	}
	return t.UTC().Format(atmos.AtprotoDatetimeLayout), nil
}
