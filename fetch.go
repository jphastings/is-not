package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/jcalabro/atmos"
	"github.com/jcalabro/atmos/identity"
)

// A subject record bigger than this never reaches the wasm allocator.
const maxRecordBytes = 1 << 20

// pdsResolver maps a DID to its PDS endpoint via its DID document. Handle
// verification is skipped: only the service endpoint matters here.
func pdsResolver() func(ctx context.Context, did string) (string, error) {
	dir := &identity.Directory{
		Resolver:               &identity.DefaultResolver{},
		Cache:                  identity.NewLRUCache(10_000, time.Hour),
		SkipHandleVerification: true,
	}
	return func(ctx context.Context, did string) (string, error) {
		id, err := dir.LookupDID(ctx, atmos.DID(did))
		if err != nil {
			return "", err
		}
		pds := id.PDSEndpoint()
		if pds == "" {
			return "", errors.New("no PDS in DID document")
		}
		// The DID document is attacker-controlled; never point the ingester at a
		// plain-http or internal service.
		if !strings.HasPrefix(pds, "https://") {
			return "", fmt.Errorf("PDS endpoint is not https: %s", pds)
		}
		return pds, nil
	}
}

// recordFetcher reads a record from its author's PDS with com.atproto.repo.getRecord.
func recordFetcher(pdsFor func(ctx context.Context, did string) (string, error), client *http.Client) func(ctx context.Context, uri string) (string, map[string]any, error) {
	return func(ctx context.Context, uri string) (string, map[string]any, error) {
		if _, err := atmos.ParseATURI(uri); err != nil {
			return "", nil, err
		}
		parts := strings.SplitN(strings.TrimPrefix(uri, "at://"), "/", 3)
		if len(parts) != 3 {
			return "", nil, fmt.Errorf("not a record uri: %s", uri)
		}
		pds, err := pdsFor(ctx, parts[0])
		if err != nil {
			return "", nil, err
		}
		q := url.Values{"repo": {parts[0]}, "collection": {parts[1]}, "rkey": {parts[2]}}
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, pds+"/xrpc/com.atproto.repo.getRecord?"+q.Encode(), nil)
		if err != nil {
			return "", nil, err
		}
		resp, err := client.Do(req)
		if err != nil {
			return "", nil, err
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			return "", nil, fmt.Errorf("getRecord %s: %s", uri, resp.Status)
		}
		body, err := io.ReadAll(io.LimitReader(resp.Body, maxRecordBytes+1))
		if err != nil {
			return "", nil, err
		}
		if len(body) > maxRecordBytes {
			return "", nil, fmt.Errorf("getRecord %s: record over %d bytes", uri, maxRecordBytes)
		}
		var out struct {
			CID   string         `json:"cid"`
			Value map[string]any `json:"value"`
		}
		if err := json.Unmarshal(body, &out); err != nil {
			return "", nil, err
		}
		if out.CID == "" || out.Value == nil {
			return "", nil, fmt.Errorf("getRecord %s: no cid or value", uri)
		}
		return out.CID, out.Value, nil
	}
}
