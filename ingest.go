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
	lenses        *lenses
	resolveHandle func(ctx context.Context, did string) (string, error)
	// fetchRecord reads a subject record from its author's PDS: the record's current cid and value.
	fetchRecord func(ctx context.Context, uri string) (cid string, record map[string]any, err error)
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
	subjects, err := in.resolveSubjects(ctx, events)
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
	for _, s := range subjects {
		if err := upsertSubject(tx, s, now); err != nil {
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

// resolveSubjects lenses the subject of every review created or updated in the batch,
// keyed by subject uri, skipping any whose record version is already stored. Network
// and lens failures are logged and skipped: the review still lands, on the poster's own
// title, and the next review naming that subject tries again.
func (in *ingester) resolveSubjects(ctx context.Context, events []jetstream.Event) (map[string]subject, error) {
	out := map[string]subject{}
	seen := map[string]bool{}
	for _, evt := range events {
		if evt.Kind != jetstream.KindCommit || evt.Commit.Collection != collection || evt.Commit.Operation == jetstream.OpDelete {
			continue
		}
		subj, _ := evt.Commit.Record["subject"].(map[string]any)
		uri, _ := subj["uri"].(string)
		cid, _ := subj["cid"].(string)
		if uri == "" || seen[uri] {
			continue
		}
		seen[uri] = true
		var known string
		err := in.db.QueryRowContext(ctx, `SELECT cid FROM subjects WHERE uri = ?`, uri).Scan(&known)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return nil, err
		}
		if err == nil && known == cid {
			continue
		}
		if s, ok := in.lensSubject(ctx, uri); ok {
			out[uri] = s
		}
	}
	return out, nil
}

// lensSubject fetches a subject record and runs the lenses over it. ok is false when
// the fetch fails, the lens errors, or no lens supports the collection.
func (in *ingester) lensSubject(ctx context.Context, uri string) (subject, bool) {
	fetchCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	cid, record, err := in.fetchRecord(fetchCtx, uri)
	cancel()
	if err != nil {
		in.log.Warn("subject fetch failed", "uri", uri, "err", err)
		return subject{}, false
	}
	res, err := in.lenses.resolveSubject(ctx, uri, cid, record)
	if err != nil {
		in.log.Warn("subject lens failed", "uri", uri, "err", err)
		return subject{}, false
	}
	if !res.Supported {
		in.log.Warn("subject collection unsupported", "uri", uri)
		return subject{}, false
	}
	return res.Subject, true
}

// resolveAndStoreSubject lenses one subject and writes it in its own transaction.
// The startup backfill uses it for subjects reviewed before subjects existed.
func (in *ingester) resolveAndStoreSubject(ctx context.Context, uri string) error {
	s, ok := in.lensSubject(ctx, uri)
	if !ok {
		return nil
	}
	tx, err := in.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := upsertSubject(tx, s, time.Now().UTC().Format(atmos.AtprotoDatetimeLayout)); err != nil {
		return err
	}
	return tx.Commit()
}

// backfillSubjects lenses every subject reviewed before the subjects table existed.
// It runs once at startup, one subject at a time, and is a no-op thereafter.
func (in *ingester) backfillSubjects(ctx context.Context) {
	rows, err := in.db.QueryContext(ctx, `SELECT DISTINCT subject_uri FROM reviews r WHERE NOT EXISTS (SELECT 1 FROM subjects s WHERE s.uri = r.subject_uri)`)
	if err != nil {
		in.log.Warn("subject backfill query failed", "err", err)
		return
	}
	var uris []string
	for rows.Next() {
		var uri string
		if err := rows.Scan(&uri); err == nil {
			uris = append(uris, uri)
		}
	}
	rows.Close()
	for _, uri := range uris {
		if ctx.Err() != nil {
			return
		}
		if err := in.resolveAndStoreSubject(ctx, uri); err != nil {
			in.log.Warn("subject backfill write failed", "uri", uri, "err", err)
		}
	}
	if len(uris) > 0 {
		in.log.Info("subject backfill done", "subjects", len(uris))
	}
}

func upsertSubject(tx *sql.Tx, s subject, now string) error {
	if _, err := tx.Exec(`
		INSERT INTO subjects (uri, cid, title, type, resolved_at) VALUES (?, ?, ?, ?, ?)
		ON CONFLICT (uri) DO UPDATE SET
			cid = excluded.cid, title = excluded.title, type = excluded.type, resolved_at = excluded.resolved_at`,
		s.URI, s.CID, s.Title, s.Type, now); err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM subject_identifiers WHERE uri = ?`, s.URI); err != nil {
		return err
	}
	for _, id := range s.Identifiers {
		if _, err := tx.Exec(`INSERT OR IGNORE INTO subject_identifiers (uri, key, value) VALUES (?, ?, ?)`, s.URI, id.Key, id.Value); err != nil {
			return err
		}
	}
	return nil
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
	locale, _ := c.Record["locale"].(string)
	_, err = tx.Exec(`
		INSERT INTO reviews (did, rkey, subject_uri, subject_cid, subject_title, subject_type, locale, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT (did, rkey) DO UPDATE SET
			subject_uri   = excluded.subject_uri,
			subject_cid   = excluded.subject_cid,
			subject_title = excluded.subject_title,
			subject_type  = excluded.subject_type,
			locale        = excluded.locale,
			created_at    = excluded.created_at,
			updated_at    = excluded.updated_at`,
		did, c.Rkey, subject["uri"], subject["cid"], subject["title"], subject["type"], locale, createdAt, updatedAt)
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
