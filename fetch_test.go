package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func fetcherAgainst(t *testing.T, handler http.HandlerFunc) func(ctx context.Context, uri string) (string, map[string]any, error) {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	return recordFetcher(func(context.Context, string) (string, error) { return srv.URL, nil }, srv.Client())
}

func TestRecordFetcherReturnsCidAndValue(t *testing.T) {
	fetch := fetcherAgainst(t, func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		if r.URL.Path != "/xrpc/com.atproto.repo.getRecord" || q.Get("repo") != "did:plc:x" || q.Get("collection") != "app.rocksky.song" || q.Get("rkey") != "3abc" {
			t.Errorf("unexpected request %s", r.URL)
		}
		w.Write([]byte(`{"uri":"at://did:plc:x/app.rocksky.song/3abc","cid":"bafycid","value":{"$type":"app.rocksky.song","title":"Angela"}}`))
	})
	cid, record, err := fetch(context.Background(), "at://did:plc:x/app.rocksky.song/3abc")
	if err != nil || cid != "bafycid" || record["title"] != "Angela" {
		t.Fatalf("got %q %v %v", cid, record, err)
	}
}

func TestRecordFetcherRejectsMissingRecordsAndHugeBodies(t *testing.T) {
	notFound := fetcherAgainst(t, func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusBadRequest) })
	if _, _, err := notFound(context.Background(), "at://did:plc:x/app.rocksky.song/3abc"); err == nil {
		t.Fatal("want an error for a non-200 response")
	}
	huge := fetcherAgainst(t, func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"cid":"bafycid","value":{"pad":"` + strings.Repeat("x", maxRecordBytes) + `"}}`))
	})
	if _, _, err := huge(context.Background(), "at://did:plc:x/app.rocksky.song/3abc"); err == nil {
		t.Fatal("want an error for a body over the limit")
	}
	if _, _, err := notFound(context.Background(), "not a uri"); err == nil {
		t.Fatal("want an error for a malformed uri")
	}
}
