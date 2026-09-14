package main

import (
	"context"
	"encoding/json"
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestLensesMatchEveryFixture(t *testing.T) {
	ctx := context.Background()
	l, err := loadLenses(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer l.Close(ctx)

	seen := 0
	err = filepath.WalkDir("packages/lenses/testdata", func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.HasSuffix(path, ".json") {
			return err
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		var fixture struct {
			Input    json.RawMessage `json:"input"`
			Expected any             `json:"expected"`
		}
		if err := json.Unmarshal(data, &fixture); err != nil {
			return err
		}
		out, err := l.call(ctx, "resolve_subject", fixture.Input)
		if err != nil {
			return err
		}
		var got any
		if err := json.Unmarshal(out, &got); err != nil {
			return err
		}
		if !reflect.DeepEqual(got, fixture.Expected) {
			t.Errorf("%s:\n got %s\nwant %v", path, out, fixture.Expected)
		}
		seen++
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if seen < 4 {
		t.Fatalf("only %d fixtures found", seen)
	}
}

func TestResolveSubjectTypedAndCollections(t *testing.T) {
	ctx := context.Background()
	l, err := loadLenses(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer l.Close(ctx)

	res, err := l.resolveSubject(ctx, "at://did:plc:example/com.example.thing/3abc", validCID, map[string]any{"name": "A Thing", "externalId": "42"})
	if err != nil {
		t.Fatal(err)
	}
	if res.Supported || res.Subject.Title != "A Thing" || len(res.Subject.Identifiers) != 1 || res.Subject.Identifiers[0] != (identifier{"externalId", "42"}) {
		t.Fatalf("resolution = %+v", res)
	}
	if _, err := l.resolveSubject(ctx, "not a uri", validCID, nil); err == nil {
		t.Fatal("want an error for a bad uri")
	}
	cols, err := l.supportedCollections(ctx)
	if err != nil || len(cols) != 1 || cols[0] != "social.popfeed.feed.review" {
		t.Fatalf("collections = %v, %v", cols, err)
	}
}
