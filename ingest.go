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

const collection = "at.isnot.tag"

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
	db  *sql.DB
	cat *lexicon.Catalog
	log *slog.Logger
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
	tx, err := in.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
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

func (in *ingester) apply(tx *sql.Tx, evt jetstream.Event) error {
	switch evt.Kind {
	case jetstream.KindCommit:
		return in.applyCommit(tx, evt.DID, evt.Commit)
	case jetstream.KindAccount:
		if evt.Account.Active || evt.Account.Status != "deleted" {
			return nil
		}
		_, err := tx.Exec(`DELETE FROM tags WHERE did = ?`, evt.DID)
		return err
	case jetstream.KindSync:
		// Replacement records follow as their own commits, so drop the stale view.
		_, err := tx.Exec(`DELETE FROM tags WHERE did = ?`, evt.DID)
		return err
	}
	return nil
}

func (in *ingester) applyCommit(tx *sql.Tx, did string, c *jetstream.Commit) error {
	if c.Collection != collection {
		return nil
	}
	if c.Operation == jetstream.OpDelete {
		_, err := tx.Exec(`DELETE FROM tags WHERE did = ? AND rkey = ?`, did, c.Rkey)
		return err
	}
	updatedAt, err := validUpdatedAt(in.cat, c.Record)
	if err != nil {
		in.log.Warn("invalid record, deleting any existing row", "did", did, "rkey", c.Rkey, "err", err)
		_, err := tx.Exec(`DELETE FROM tags WHERE did = ? AND rkey = ?`, did, c.Rkey)
		return err
	}
	subject := c.Record["subject"].(map[string]any)
	_, err = tx.Exec(`
		INSERT INTO tags (did, rkey, subject_uri, subject_cid, adjective, direction, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT (did, rkey) DO UPDATE SET
			subject_uri = excluded.subject_uri,
			subject_cid = excluded.subject_cid,
			adjective   = excluded.adjective,
			direction   = excluded.direction,
			updated_at  = excluded.updated_at`,
		did, c.Rkey, subject["uri"], subject["cid"], c.Record["adjective"], c.Record["direction"], updatedAt)
	return err
}

// validUpdatedAt validates the record against the lexicon, then normalises
// updatedAt to fixed-width UTC so TEXT ordering in the tags table is chronological.
func validUpdatedAt(cat *lexicon.Catalog, record map[string]any) (string, error) {
	if err := lexval.ValidateRecord(cat, collection, record); err != nil {
		return "", err
	}
	t, err := time.Parse(time.RFC3339Nano, record["updatedAt"].(string))
	if err != nil {
		return "", err
	}
	return t.UTC().Format(atmos.AtprotoDatetimeLayout), nil
}
