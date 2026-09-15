package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"runtime/debug"
	"strconv"
	"strings"
	"time"
)

// apiHandler is the public XRPC surface: the health check plus any endpoint
// backed by the shared database.
func apiHandler(db *sql.DB) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /xrpc/_health", healthCheck)
	mux.HandleFunc("GET /xrpc/at.isnot.suggestSubjects", suggestSubjectsHandler(db))
	return withCORS(mux)
}

// withCORS allows any origin to GET the XRPC routes: this is a public read API
// served from a different host (api.isnot.at) than the site that calls it.
func withCORS(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		h.ServeHTTP(w, r)
	})
}

func healthCheck(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"version": version()})
}

type suggestSubjectsResponse struct {
	Subjects []subject `json:"subjects"`
}

func suggestSubjectsHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := strings.TrimSpace(r.URL.Query().Get("q"))
		limit := 8
		if raw := r.URL.Query().Get("limit"); raw != "" {
			if n, err := strconv.Atoi(raw); err == nil && n > 0 {
				limit = n
			}
		}
		if limit > 25 {
			limit = 25
		}

		subjects := []subject{}
		if q != "" {
			var err error
			subjects, err = suggestSubjects(r.Context(), db, q, limit)
			if err != nil {
				http.Error(w, "internal error", http.StatusInternalServerError)
				return
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(suggestSubjectsResponse{Subjects: subjects})
	}
}

// likeEscape lowercases q and escapes SQLite LIKE wildcards so a literal % or _
// in a search term is matched literally rather than acting as a wildcard.
func likeEscape(q string) string {
	r := strings.NewReplacer(`\`, `\\`, "%", `\%`, "_", `\_`)
	return r.Replace(strings.ToLower(q))
}

// suggestSubjects ranks distinct subjects (by subject_uri) whose title contains
// q: titles starting with q first, then any other containing match; within a
// tier, the most-reviewed subject first, then alphabetically. Each subject's
// cid/title/type come from its most recently updated review.
//
// SQLite's LOWER and NOCASE fold ASCII only, so a title typed with different
// accents or in a non-Latin script matches only on its exact case. Reviews
// carry a locale, so this will want a folded title column (or ICU) eventually.
func suggestSubjects(ctx context.Context, db *sql.DB, q string, limit int) ([]subject, error) {
	escaped := likeEscape(q)
	prefix := escaped + "%"
	contains := "%" + escaped + "%"

	rows, err := db.QueryContext(ctx, `
		SELECT subject_uri, subject_cid, subject_title, subject_type
		FROM (
			SELECT subject_uri, subject_cid, subject_title, subject_type,
			       COUNT(*) OVER (PARTITION BY subject_uri) AS cnt,
			       ROW_NUMBER() OVER (PARTITION BY subject_uri ORDER BY updated_at DESC, rowid DESC) AS rn,
			       MIN(CASE WHEN LOWER(subject_title) LIKE ? ESCAPE '\' THEN 0 ELSE 1 END)
			           OVER (PARTITION BY subject_uri) AS rank_tier
			FROM reviews
			WHERE LOWER(subject_title) LIKE ? ESCAPE '\'
		)
		WHERE rn = 1
		ORDER BY rank_tier ASC, cnt DESC, subject_title COLLATE NOCASE ASC
		LIMIT ?
	`, prefix, contains, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	subjects := []subject{}
	for rows.Next() {
		var s subject
		if err := rows.Scan(&s.URI, &s.CID, &s.Title, &s.Type); err != nil {
			return nil, err
		}
		subjects = append(subjects, s)
	}
	return subjects, rows.Err()
}

func version() string {
	info, ok := debug.ReadBuildInfo()
	if !ok || info.Main.Version == "" {
		return "dev"
	}
	return info.Main.Version
}

func serve(ctx context.Context, addr string, h http.Handler, log *slog.Logger) error {
	srv := &http.Server{Addr: addr, Handler: h, ReadHeaderTimeout: 10 * time.Second}

	errCh := make(chan error, 1)
	go func() {
		log.Info("serving http", "addr", addr)
		errCh <- srv.ListenAndServe()
	}()

	select {
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		srv.Shutdown(shutdownCtx)
		return nil
	case err := <-errCh:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	}
}
