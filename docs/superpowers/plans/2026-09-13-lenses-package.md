# Lenses Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One wasm artifact, built from panproto lens documents in Rust, that turns an atproto record into an `at.isnot.tag` subject, usable from TypeScript (browser and Node) and from Go without cgo.

**Architecture:** `packages/lenses` holds a Rust `cdylib` (engine + embedded lens documents + finalizer) exposing a plain buffer ABI, a TypeScript wrapper published as `@is-not/lenses`, and shared fixtures. `lens.go` at the repo root embeds the built wasm and runs it with wazero. The wasm is git-ignored; a script fetches the released artifact for Go builds. A GitHub workflow tests on change and, via changesets, publishes to npm and attaches the wasm to a GitHub release.

**Tech Stack:** Rust stable with `wasm32-unknown-unknown`, panproto 0.74.2 crates, unicode-segmentation, wasm-opt; pnpm 11 workspace, Vite+ (`vp`) for pack/test/lint/fmt, changesets; Go 1.26 with `github.com/tetratelabs/wazero`.

**Spec:** `docs/superpowers/specs/2026-09-13-lenses-package-design.md`

## Global Constraints

- npm package name `@is-not/lenses`, version starts at `0.1.0`, `publishConfig.access: public`, ESM only, Node ≥ 20.
- Wasm ABI exactly: `alloc(len) -> ptr`, `dealloc(ptr, len)`, `resolve_subject(ptr, len) -> ptr`, `supported_collections() -> ptr`; results are `[u32 little-endian len][utf-8 json]` and are freed with `dealloc(ptr, 4+len)`. No wasm-bindgen, no imports.
- Output shapes: success `{"supported": bool, "subject": {uri, cid, title, type, identifiers?}}`; error `{"error": string}`. `identifiers` omitted when empty, otherwise sorted by key then value, deduplicated, ≤ 32 entries, key ≤ 64 bytes, value ≤ 512 bytes. Title trimmed, ≤ 256 graphemes, ≤ 2560 bytes, falls back to the uri when empty. Type ≤ 64 bytes.
- Type mapping for popfeed: `tv_show → tv-show`, `tv_season → tv-season`, `tv_episode → tv-episode`, `book_series → book-series`, `video_game → video-game`, `track → music-track`, all else unchanged. Lexicon knownValues: movie, tv-show, tv-season, tv-episode, book, book-series, album, music-track, video-game, post.
- Guess for unsupported NSIDs: title from the first present string among `title`, `name`, `displayName`, `text`, else the uri; type `""`; identifiers from top-level string fields whose name ends in `Id` or `ID`, or is one of `isbn`, `isbn10`, `isbn13`, `asin`, `doi`.
- Building the wasm on JP's Mac must go through rustup's toolchain (`rustup which rustc --toolchain stable`, set `RUSTC` and prepend its dir to `PATH`, run `rustup run stable cargo`), because Homebrew's cargo shadows rustup. `wasm-opt -Oz --all-features` (plain `-Oz` fails validation on binaryen 130).
- The built wasm at `packages/lenses/dist/isnot_lenses.wasm` is git-ignored. Go embeds that exact path. Fixtures under `packages/lenses/testdata/` are the contract for all three runtimes.
- Minimal code, stdlib first, comments only where counter-intuitive, behavioral concise tests. Commit to `main`; messages say what and why, no test summaries, no attribution lines.

---

### Task 1: Workspace tooling and lexicon knownValues

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `vite.config.ts`, `.changeset/config.json`, `.npmrc`
- Modify: `.gitignore`, `lexicons/at/isnot/tag.json`
- Create (generated): `pnpm-lock.yaml`

**Interfaces:**
- Produces: a pnpm workspace whose packages can run `vp` from `node_modules/.bin`; changesets configured with public access.

- [ ] **Step 1: Root package files**

`package.json`:

```json
{
  "name": "isnot",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@11.25.0",
  "scripts": {
    "check": "vp check",
    "test": "pnpm -r run test",
    "build": "pnpm -r run build",
    "changeset": "changeset",
    "version": "changeset version",
    "release": "pnpm -r run build && changeset publish"
  },
  "devDependencies": {
    "@changesets/cli": "^2.29.0",
    "vite-plus": "^0.2.7"
  }
}
```

`pnpm-workspace.yaml`:

```yaml
packages:
  - packages/*
  - web
```

`vite.config.ts`:

```ts
import { defineConfig } from 'vite-plus';

export default defineConfig({
  fmt: { singleQuote: true },
  lint: { plugins: ['typescript'] },
});
```

`.npmrc`:

```
engine-strict=true
```

`.changeset/config.json`:

```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.1.1/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": []
}
```

Append to `.gitignore`:

```
node_modules/
packages/lenses/dist/
packages/lenses/target/
```

- [ ] **Step 2: Lexicon knownValues**

In `lexicons/at/isnot/tag.json`, change the `type` property's `knownValues` to:

```json
"knownValues": ["movie", "tv-show", "tv-season", "tv-episode", "book", "book-series", "album", "music-track", "video-game", "post"]
```

- [ ] **Step 3: Install and verify**

```bash
pnpm install
pnpm exec vp --version
go test ./...
```
Expected: install completes and writes `pnpm-lock.yaml`; `vp` prints a version; Go tests still pass (the `post` type used in tests is still a known value, and knownValues are not enforced anyway).

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-workspace.yaml pnpm-lock.yaml vite.config.ts .npmrc .changeset .gitignore lexicons
git commit -m "chore: pnpm workspace with Vite+ and changesets; hyphenated subject types

The lenses package and the site both live in this workspace. Subject
type values use hyphens throughout so lens output and knownValues agree."
```

---

### Task 2: Rust crate, first lens, fixtures

**Files:**
- Create: `packages/lenses/Cargo.toml`, `packages/lenses/src/lib.rs`
- Create: `packages/lenses/lenses/social.popfeed.feed.review.json`
- Create: `packages/lenses/lexicons/social/popfeed/feed/review.json` (verbatim upstream copy)
- Create: `packages/lenses/testdata/social.popfeed.feed.review/movie.json`, `.../tv-show.json`, `packages/lenses/testdata/unsupported/guess.json`, `packages/lenses/testdata/malformed/no-record.json`
- Create: `packages/lenses/build-wasm.sh`

**Interfaces:**
- Produces: the wasm ABI from Global Constraints; `packages/lenses/dist/isnot_lenses.wasm` after `sh build-wasm.sh`.
- Produces: fixture file shape `{"input": {"uri","cid","record"}, "expected": <exact output>}` consumed by Tasks 3 and 4.

- [ ] **Step 1: Cargo.toml**

```toml
[package]
name = "isnot_lenses"
version = "0.1.0"
edition = "2024"
publish = false

[lib]
crate-type = ["cdylib", "rlib"]

[dependencies]
panproto-inst = "0.74.2"
panproto-lens = "0.74.2"
panproto-lens-dsl = "0.74.2"
panproto-protocols = "0.74.2"
panproto-schema = "0.74.2"
serde_json = "1"
unicode-segmentation = "1"

[profile.release]
opt-level = "z"
lto = true
codegen-units = 1
panic = "abort"
strip = true
```

- [ ] **Step 2: Vendor the popfeed lexicon and write the lens**

```bash
mkdir -p packages/lenses/lexicons/social/popfeed/feed
curl -fsSL https://raw.githubusercontent.com/Popfeed-Social/Popfeed-Community/main/lexicons/review.json \
  -o packages/lenses/lexicons/social/popfeed/feed/review.json
python3 -c "import json;print(json.load(open('packages/lenses/lexicons/social/popfeed/feed/review.json'))['id'])"
```
Expected: prints `social.popfeed.feed.review`.

`packages/lenses/lenses/social.popfeed.feed.review.json`:

```json
{
  "id": "at.isnot.lens.social-popfeed-feed-review",
  "description": "A popfeed review names the creative work it reviews; the tag subject is that work.",
  "source": "social.popfeed.feed.review",
  "target": "at.isnot.tag#subject",
  "extensions": {
    "at.isnot": { "identifiers": "identifiers" }
  },
  "steps": [
    { "rename_field": { "old": "creativeWorkType", "new": "type" } },
    {
      "apply_expr": {
        "field": "type",
        "expr": "if type == \"tv_show\" then \"tv-show\" else if type == \"tv_season\" then \"tv-season\" else if type == \"tv_episode\" then \"tv-episode\" else if type == \"book_series\" then \"book-series\" else if type == \"video_game\" then \"video-game\" else if type == \"track\" then \"music-track\" else type",
        "coercion": "projection"
      }
    }
  ]
}
```

- [ ] **Step 3: Fixtures**

Fetch the real record once and build the movie fixture from it:

```bash
mkdir -p packages/lenses/testdata/social.popfeed.feed.review packages/lenses/testdata/unsupported packages/lenses/testdata/malformed
curl -s "https://eurosky.social/xrpc/com.atproto.repo.getRecord?repo=did:plc:ephkzpinhaqcabtkugtbzrwu&collection=social.popfeed.feed.review&rkey=3lsdno2qnoc2g" \
  | python3 -c '
import json,sys
r=json.load(sys.stdin)
f={"input":{"uri":r["uri"],"cid":r["cid"],"record":r["value"]},
   "expected":{"supported":True,"subject":{"uri":r["uri"],"cid":r["cid"],
     "title":"Mission: Impossible - The Final Reckoning","type":"movie",
     "identifiers":[{"key":"imdbId","value":"tt9603208"},{"key":"tmdbId","value":"575265"}]}}}
json.dump(f,open("packages/lenses/testdata/social.popfeed.feed.review/movie.json","w"),indent=2,ensure_ascii=False)
'
```

`packages/lenses/testdata/social.popfeed.feed.review/tv-show.json`:

```json
{
  "input": {
    "uri": "at://did:plc:ephkzpinhaqcabtkugtbzrwu/social.popfeed.feed.review/3tvshow",
    "cid": "bafyreibzsi5ubmnp4dx744kye6ulejwmpdhhnmem2vnaocgqm2fybvzyqa",
    "record": {
      "$type": "social.popfeed.feed.review",
      "title": "  Severance ",
      "creativeWorkType": "tv_show",
      "identifiers": { "tmdbId": "95396", "imdbId": "tt11280740", "seasonNumber": 2 },
      "rating": 9,
      "createdAt": "2025-06-24T08:09:31.431Z",
      "genres": ["Drama"]
    }
  },
  "expected": {
    "supported": true,
    "subject": {
      "uri": "at://did:plc:ephkzpinhaqcabtkugtbzrwu/social.popfeed.feed.review/3tvshow",
      "cid": "bafyreibzsi5ubmnp4dx744kye6ulejwmpdhhnmem2vnaocgqm2fybvzyqa",
      "title": "Severance",
      "type": "tv-show",
      "identifiers": [{ "key": "imdbId", "value": "tt11280740" }, { "key": "tmdbId", "value": "95396" }]
    }
  }
}
```

`packages/lenses/testdata/unsupported/guess.json`:

```json
{
  "input": {
    "uri": "at://did:plc:example/com.example.thing/3abc",
    "cid": "bafyreibzsi5ubmnp4dx744kye6ulejwmpdhhnmem2vnaocgqm2fybvzyqa",
    "record": {
      "$type": "com.example.thing",
      "name": "A Thing",
      "externalId": "42",
      "isbn13": "9780000000002",
      "count": 3,
      "tags": ["x"]
    }
  },
  "expected": {
    "supported": false,
    "subject": {
      "uri": "at://did:plc:example/com.example.thing/3abc",
      "cid": "bafyreibzsi5ubmnp4dx744kye6ulejwmpdhhnmem2vnaocgqm2fybvzyqa",
      "title": "A Thing",
      "type": "",
      "identifiers": [{ "key": "externalId", "value": "42" }, { "key": "isbn13", "value": "9780000000002" }]
    }
  }
}
```

`packages/lenses/testdata/malformed/no-record.json`:

```json
{
  "input": { "uri": "at://did:plc:example/com.example.thing/3abc", "cid": "bafyreibzsi5ubmnp4dx744kye6ulejwmpdhhnmem2vnaocgqm2fybvzyqa" },
  "expected": { "error": "input.record must be an object" }
}
```

- [ ] **Step 4: Write the failing tests inside lib.rs**

Create `packages/lenses/src/lib.rs` with only the crate doc comment and the test module for now:

```rust
//! at.isnot lenses: turns an atproto record into an `at.isnot.tag` subject.
//! Built as a wasm cdylib with a plain buffer ABI; see the package README.

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};
    use std::path::Path;

    fn fixtures(dir: &Path, out: &mut Vec<(String, Value)>) {
        for entry in std::fs::read_dir(dir).unwrap() {
            let path = entry.unwrap().path();
            if path.is_dir() {
                fixtures(&path, out);
            } else if path.extension().is_some_and(|e| e == "json") {
                let text = std::fs::read_to_string(&path).unwrap();
                out.push((path.display().to_string(), serde_json::from_str(&text).unwrap()));
            }
        }
    }

    #[test]
    fn every_fixture_matches() {
        let mut all = Vec::new();
        fixtures(Path::new(concat!(env!("CARGO_MANIFEST_DIR"), "/testdata")), &mut all);
        assert!(all.len() >= 4, "expected at least four fixtures, found {}", all.len());
        for (name, fixture) in all {
            let out = resolve(&fixture["input"].to_string());
            assert_eq!(out, fixture["expected"], "{name}");
        }
    }

    #[test]
    fn supported_collections_lists_popfeed() {
        assert_eq!(collections(), vec!["social.popfeed.feed.review"]);
    }

    #[test]
    fn title_is_trimmed_and_capped_at_256_graphemes() {
        let long = "é".repeat(300);
        let subject = finalize("at://x/y/z", "cid", format!("  {long}  "), "movie".into(), vec![]);
        assert_eq!(subject["title"].as_str().unwrap().chars().count(), 256);
        let empty = finalize("at://x/y/z", "cid", "   ".into(), "".into(), vec![]);
        assert_eq!(empty["title"], "at://x/y/z");
    }

    #[test]
    fn identifiers_are_sorted_deduped_capped_and_size_limited() {
        let mut ids: Vec<(String, String)> = (0..40).map(|i| (format!("k{i:02}"), "v".into())).collect();
        ids.push(("k00".into(), "v".into()));
        ids.push(("a".repeat(65), "v".into()));
        ids.push(("ok".into(), "v".repeat(513)));
        ids.push(("aaa".into(), "z".into()));
        let subject = finalize("at://x/y/z", "cid", "t".into(), "".into(), ids);
        let out = subject["identifiers"].as_array().unwrap();
        assert_eq!(out.len(), 32);
        assert_eq!(out[0], json!({"key": "aaa", "value": "z"}));
        assert_eq!(out[1], json!({"key": "k00", "value": "v"}));
        assert!(out.iter().all(|i| i["key"].as_str().unwrap().len() <= 64 && i["value"].as_str().unwrap().len() <= 512));
        let none = finalize("at://x/y/z", "cid", "t".into(), "".into(), vec![]);
        assert!(none.get("identifiers").is_none());
    }
}
```

- [ ] **Step 5: Run the tests to see them fail**

Run from `packages/lenses`: `cargo test`
Expected: compile errors for `resolve`, `collections`, `finalize` not found.

- [ ] **Step 6: Implement lib.rs**

Insert the following between the crate doc comment and the test module:

```rust
use std::collections::HashMap;
use std::sync::OnceLock;

use panproto_lens::Lens;
use panproto_protocols::atproto;
use panproto_schema::Schema;
use serde_json::{json, Map, Value};
use unicode_segmentation::UnicodeSegmentation;

struct LensSource {
    nsid: &'static str,
    document: &'static str,
    lexicon: &'static str,
}

/// Every supported collection. Adding a lens means adding its document and
/// source lexicon under the package and one entry here.
const SOURCES: &[LensSource] = &[LensSource {
    nsid: "social.popfeed.feed.review",
    document: include_str!("../lenses/social.popfeed.feed.review.json"),
    lexicon: include_str!("../lexicons/social/popfeed/feed/review.json"),
}];

struct Prepared {
    schema: Schema,
    lens: Lens,
    // panproto drops ref-typed properties from lens output (ISNOT-qvqp), so a
    // lens names its identifiers object in `extensions["at.isnot"]["identifiers"]`
    // and we read it straight from the source record.
    identifiers_field: Option<String>,
}

fn prepare(src: &LensSource) -> Result<Prepared, String> {
    let fail = |stage: &str, e: String| format!("{}: {stage}: {e}", src.nsid);
    let lexicon: Value = serde_json::from_str(src.lexicon).map_err(|e| fail("lexicon", e.to_string()))?;
    let schema = atproto::parse_lexicon(&lexicon).map_err(|e| fail("lexicon", e.to_string()))?;
    let doc = panproto_lens_dsl::eval::eval_json(src.document).map_err(|e| fail("lens", e.to_string()))?;
    let identifiers_field = doc
        .extensions
        .get("at.isnot")
        .and_then(|v| v.get("identifiers"))
        .and_then(Value::as_str)
        .map(str::to_owned);
    let compiled = panproto_lens_dsl::compile(&doc, &format!("{}:body", src.nsid), &|_| None)
        .map_err(|e| fail("lens", e.to_string()))?;
    let lens = compiled
        .instantiate(&schema, &atproto::protocol())
        .map_err(|e| fail("lens", e.to_string()))?;
    Ok(Prepared { schema, lens, identifiers_field })
}

fn registry() -> Result<&'static HashMap<&'static str, Prepared>, String> {
    static REGISTRY: OnceLock<Result<HashMap<&'static str, Prepared>, String>> = OnceLock::new();
    REGISTRY
        .get_or_init(|| SOURCES.iter().map(|s| prepare(s).map(|p| (s.nsid, p))).collect())
        .as_ref()
        .map_err(Clone::clone)
}

pub fn collections() -> Vec<&'static str> {
    SOURCES.iter().map(|s| s.nsid).collect()
}

/// Resolve a `{"uri","cid","record"}` JSON input to the output documented in the spec.
pub fn resolve(input: &str) -> Value {
    match resolve_inner(input) {
        Ok(v) => v,
        Err(e) => json!({ "error": e }),
    }
}

fn resolve_inner(input: &str) -> Result<Value, String> {
    let input: Value = serde_json::from_str(input).map_err(|e| format!("input is not JSON: {e}"))?;
    let uri = input.get("uri").and_then(Value::as_str).ok_or("input.uri must be a string")?;
    let cid = input.get("cid").and_then(Value::as_str).ok_or("input.cid must be a string")?;
    let record = input.get("record").and_then(Value::as_object).ok_or("input.record must be an object")?;
    let nsid = collection_of(uri)
        .or_else(|| record.get("$type").and_then(Value::as_str))
        .ok_or("cannot determine the record's collection")?;
    let (supported, title, kind, identifiers) = match registry()?.get(nsid) {
        Some(prepared) => {
            let (t, k, i) = apply_lens(prepared, nsid, record)?;
            (true, t, k, i)
        }
        None => {
            let (t, k, i) = guess(uri, record);
            (false, t, k, i)
        }
    };
    Ok(json!({ "supported": supported, "subject": finalize(uri, cid, title, kind, identifiers) }))
}

fn collection_of(uri: &str) -> Option<&str> {
    let mut parts = uri.strip_prefix("at://")?.split('/');
    parts.next()?;
    parts.next().filter(|c| !c.is_empty())
}

type Fields = (String, String, Vec<(String, String)>);

fn apply_lens(p: &Prepared, nsid: &str, record: &Map<String, Value>) -> Result<Fields, String> {
    let body = format!("{nsid}:body");
    let instance = panproto_inst::parse_json(&p.schema, &body, &Value::Object(record.clone()))
        .map_err(|e| format!("record does not match {nsid}: {e}"))?;
    let (view, _complement) = panproto_lens::get(&p.lens, &instance).map_err(|e| format!("lens failed for {nsid}: {e}"))?;
    let view = panproto_inst::to_json(&p.lens.tgt_schema, &view);
    let title = view
        .get("title")
        .and_then(Value::as_str)
        .ok_or_else(|| format!("lens for {nsid} produced no title"))?
        .to_owned();
    let kind = view.get("type").and_then(Value::as_str).unwrap_or("").to_owned();
    let identifiers = p
        .identifiers_field
        .as_deref()
        .and_then(|f| record.get(f))
        .and_then(Value::as_object)
        .map(string_entries)
        .unwrap_or_default();
    Ok((title, kind, identifiers))
}

fn string_entries(m: &Map<String, Value>) -> Vec<(String, String)> {
    m.iter().filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_owned()))).collect()
}

const TITLE_FIELDS: &[&str] = &["title", "name", "displayName", "text"];
const IDENTIFIER_FIELDS: &[&str] = &["isbn", "isbn10", "isbn13", "asin", "doi"];

fn guess(uri: &str, record: &Map<String, Value>) -> Fields {
    let title = TITLE_FIELDS
        .iter()
        .find_map(|f| record.get(*f).and_then(Value::as_str))
        .unwrap_or(uri)
        .to_owned();
    let identifiers = record
        .iter()
        .filter(|(k, _)| k.ends_with("Id") || k.ends_with("ID") || IDENTIFIER_FIELDS.contains(&k.as_str()))
        .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_owned())))
        .collect();
    (title, String::new(), identifiers)
}

const MAX_TITLE_GRAPHEMES: usize = 256;
const MAX_TITLE_BYTES: usize = 2560;
const MAX_TYPE_BYTES: usize = 64;
const MAX_IDENTIFIERS: usize = 32;
const MAX_KEY_BYTES: usize = 64;
const MAX_VALUE_BYTES: usize = 512;

fn finalize(uri: &str, cid: &str, title: String, kind: String, mut identifiers: Vec<(String, String)>) -> Value {
    let title: String = title.trim().graphemes(true).take(MAX_TITLE_GRAPHEMES).collect();
    let title = truncate_bytes(&title, MAX_TITLE_BYTES);
    let title = if title.is_empty() { uri.to_owned() } else { title };
    let kind = truncate_bytes(&kind, MAX_TYPE_BYTES);
    identifiers.retain(|(k, v)| k.len() <= MAX_KEY_BYTES && v.len() <= MAX_VALUE_BYTES);
    identifiers.sort();
    identifiers.dedup();
    identifiers.truncate(MAX_IDENTIFIERS);
    let mut subject = json!({ "uri": uri, "cid": cid, "title": title, "type": kind });
    if !identifiers.is_empty() {
        subject["identifiers"] = identifiers.into_iter().map(|(k, v)| json!({ "key": k, "value": v })).collect();
    }
    subject
}

fn truncate_bytes(s: &str, max: usize) -> String {
    let mut end = s.len().min(max);
    while !s.is_char_boundary(end) {
        end -= 1;
    }
    s[..end].to_owned()
}

// ---- buffer ABI ----------------------------------------------------------
// Host writes input at alloc(len), calls a function, reads [u32 len][bytes] at
// the returned pointer, then dealloc(ptr, 4 + len). See the package README.

fn to_result(out: String) -> *mut u8 {
    let out = out.into_bytes();
    let mut buf = Vec::with_capacity(4 + out.len());
    buf.extend_from_slice(&(out.len() as u32).to_le_bytes());
    buf.extend_from_slice(&out);
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

#[unsafe(no_mangle)]
pub extern "C" fn alloc(len: u32) -> *mut u8 {
    let mut v = Vec::<u8>::with_capacity(len as usize);
    let ptr = v.as_mut_ptr();
    std::mem::forget(v);
    ptr
}

/// # Safety
/// `ptr` must come from `alloc` (with the same `len`) or be a result pointer
/// (with `len` = 4 + payload length).
#[unsafe(no_mangle)]
pub unsafe extern "C" fn dealloc(ptr: *mut u8, len: u32) {
    drop(unsafe { Vec::from_raw_parts(ptr, 0, len as usize) });
}

/// # Safety
/// `ptr` must point at `len` readable bytes written by the host.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn resolve_subject(ptr: *const u8, len: u32) -> *mut u8 {
    let bytes = unsafe { std::slice::from_raw_parts(ptr, len as usize) };
    let input = std::str::from_utf8(bytes).unwrap_or("");
    to_result(resolve(input).to_string())
}

#[unsafe(no_mangle)]
pub extern "C" fn supported_collections() -> *mut u8 {
    to_result(serde_json::to_string(&collections()).expect("static list serialises"))
}
```

- [ ] **Step 7: Run the tests**

Run from `packages/lenses`: `cargo test`
Expected: all four tests PASS. If `every_fixture_matches` fails on `movie.json` because panproto rejects a field of the real record, do not edit the lens; report the exact error.

- [ ] **Step 8: Build script and wasm build**

`packages/lenses/build-wasm.sh`:

```sh
#!/bin/sh
# Builds dist/isnot_lenses.wasm. Uses rustup's toolchain explicitly because
# Homebrew's cargo can shadow it and lacks the wasm32 target.
set -eu
cd "$(dirname "$0")"
if command -v rustup >/dev/null 2>&1; then
  RUSTC="$(rustup which rustc --toolchain stable)"
  export RUSTC
  PATH="$(dirname "$RUSTC"):$PATH"
  export PATH
  CARGO="rustup run stable cargo"
else
  CARGO=cargo
fi
$CARGO build --release --target wasm32-unknown-unknown
mkdir -p dist
wasm-opt -Oz --all-features -o dist/isnot_lenses.wasm target/wasm32-unknown-unknown/release/isnot_lenses.wasm
ls -l dist/isnot_lenses.wasm
```

Run: `sh packages/lenses/build-wasm.sh`
Expected: prints the artifact, roughly 800KB to 1.2MB. If `rustup target list --installed` lacks `wasm32-unknown-unknown`, run `rustup target add wasm32-unknown-unknown` first.

- [ ] **Step 9: Commit**

```bash
git add packages/lenses/Cargo.toml packages/lenses/Cargo.lock packages/lenses/src/lib.rs packages/lenses/lenses packages/lenses/lexicons packages/lenses/testdata packages/lenses/build-wasm.sh
git commit -m "feat(lenses): panproto lens engine as a wasm cdylib with the popfeed lens

The finalizer (type mapping, identifiers, size limits, unsupported-NSID
guessing) lives here once so Go and TypeScript hosts agree. Identifiers
are read via the lens document's extensions block because panproto drops
ref-typed properties (ISNOT-qvqp)."
```

---

### Task 3: TypeScript wrapper `@is-not/lenses`

**Files:**
- Create: `packages/lenses/package.json`, `packages/lenses/vite.config.ts`, `packages/lenses/tsconfig.json`
- Create: `packages/lenses/src/index.ts`, `packages/lenses/src/index.test.ts`
- Create: `packages/lenses/README.md`
- Create: `.changeset/first-lenses.md`

**Interfaces:**
- Consumes: the wasm ABI and fixtures from Task 2; `dist/isnot_lenses.wasm` must exist (run `sh build-wasm.sh` first).
- Produces: exports `loadLenses`, `Lenses`, `fetchRecord`, `buildTag` and the types `Subject`, `Identifier`, `Resolution`, `Direction`.

- [ ] **Step 1: Package files**

`packages/lenses/package.json`:

```json
{
  "name": "@is-not/lenses",
  "version": "0.1.0",
  "description": "Turn an atproto record into an at.isnot.tag subject, using panproto lenses compiled to WebAssembly",
  "license": "MIT",
  "type": "module",
  "repository": { "type": "git", "url": "https://github.com/jphastings/is-not", "directory": "packages/lenses" },
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
    "./isnot_lenses.wasm": "./dist/isnot_lenses.wasm"
  },
  "files": ["dist"],
  "engines": { "node": ">=20" },
  "publishConfig": { "access": "public" },
  "scripts": {
    "build:wasm": "sh build-wasm.sh",
    "build": "sh build-wasm.sh && vp pack",
    "test": "cargo test && vp test --run"
  },
  "devDependencies": {
    "vite-plus": "^0.2.7"
  }
}
```

`packages/lenses/vite.config.ts`:

```ts
import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    platform: 'neutral',
    external: ['node:fs/promises', 'node:url'],
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
```

`packages/lenses/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "allowImportingTsExtensions": true,
    "types": ["node"],
    "noEmit": true
  },
  "include": ["src"]
}
```

Add `@types/node` as a devDependency: `pnpm --filter @is-not/lenses add -D @types/node`.

`.changeset/first-lenses.md`:

```markdown
---
"@is-not/lenses": minor
---

First release: popfeed review lens, unsupported-NSID guessing, `fetchRecord` and `buildTag`.
```

- [ ] **Step 2: Write the failing tests**

`packages/lenses/src/index.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildTag, fetchRecord, loadLenses } from './index.ts';

const testdata = new URL('../testdata/', import.meta.url).pathname;

function fixtures(dir: string): [string, { input: unknown; expected: unknown }][] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return fixtures(path);
    return name.endsWith('.json') ? [[path, JSON.parse(readFileSync(path, 'utf8'))]] : [];
  });
}

const lenses = await loadLenses();

describe('resolveSubject', () => {
  for (const [name, { input, expected }] of fixtures(testdata)) {
    it(name, () => {
      expect(lenses.resolveSubject(input as never)).toEqual(expected);
    });
  }
  it('lists supported collections', () => {
    expect(lenses.supportedCollections()).toContain('social.popfeed.feed.review');
  });
});

const uri = 'at://did:plc:example/com.example.thing/3abc';
const cid = 'bafyreibzsi5ubmnp4dx744kye6ulejwmpdhhnmem2vnaocgqm2fybvzyqa';
const stubFetch = (async (url: string | URL | Request) => {
  const u = String(url);
  if (u === 'https://plc.directory/did:plc:example') {
    return Response.json({ service: [{ id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: 'https://pds.example' }] });
  }
  if (u.startsWith('https://pds.example/xrpc/com.atproto.repo.getRecord?')) {
    const q = new URL(u).searchParams;
    expect([q.get('repo'), q.get('collection'), q.get('rkey')]).toEqual(['did:plc:example', 'com.example.thing', '3abc']);
    return Response.json({ uri, cid, value: { $type: 'com.example.thing', name: 'A Thing', externalId: '42' } });
  }
  return new Response('not found', { status: 404 });
}) as typeof fetch;

describe('fetchRecord', () => {
  it('resolves the PDS and fetches the record', async () => {
    await expect(fetchRecord(uri, stubFetch)).resolves.toEqual({ cid, record: { $type: 'com.example.thing', name: 'A Thing', externalId: '42' } });
  });
  it('rejects non-record uris', async () => {
    await expect(fetchRecord('at://did:plc:example', stubFetch)).rejects.toThrow(/at-uri/);
  });
});

describe('buildTag', () => {
  it('produces a complete at.isnot.tag record', async () => {
    const { record, supported } = await buildTag(lenses, { uri, direction: 1, adjective: 'good' }, stubFetch);
    expect(supported).toBe(false);
    expect(record).toMatchObject({
      $type: 'at.isnot.tag',
      adjective: 'good',
      direction: 1,
      subject: { uri, cid, title: 'A Thing', type: '', identifiers: [{ key: 'externalId', value: '42' }] },
    });
    expect(record.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run from `packages/lenses`: `pnpm exec vp test --run`
Expected: FAIL, `./index.ts` cannot be resolved.

- [ ] **Step 4: Implement index.ts**

`packages/lenses/src/index.ts`:

```ts
export type Identifier = { key: string; value: string };
export type Subject = { uri: string; cid: string; title: string; type: string; identifiers?: Identifier[] };
export type Resolution = { supported: boolean; subject: Subject } | { error: string };
export type Direction = -2 | -1 | 0 | 1 | 2;
export type TagRecord = {
  $type: 'at.isnot.tag';
  subject: Subject;
  adjective: string;
  direction: Direction;
  updatedAt: string;
};

type Exports = {
  memory: WebAssembly.Memory;
  alloc(len: number): number;
  dealloc(ptr: number, len: number): void;
  resolve_subject(ptr: number, len: number): number;
  supported_collections(): number;
};

export class Lenses {
  #exports: Exports;

  constructor(instance: WebAssembly.Instance) {
    this.#exports = instance.exports as unknown as Exports;
  }

  resolveSubject(input: { uri: string; cid: string; record: unknown }): Resolution {
    const bytes = new TextEncoder().encode(JSON.stringify(input));
    const ptr = this.#exports.alloc(bytes.length);
    new Uint8Array(this.#exports.memory.buffer, ptr, bytes.length).set(bytes);
    const result = this.#exports.resolve_subject(ptr, bytes.length);
    this.#exports.dealloc(ptr, bytes.length);
    return JSON.parse(this.#take(result));
  }

  supportedCollections(): string[] {
    return JSON.parse(this.#take(this.#exports.supported_collections()));
  }

  #take(result: number): string {
    const len = new DataView(this.#exports.memory.buffer).getUint32(result, true);
    const text = new TextDecoder().decode(new Uint8Array(this.#exports.memory.buffer, result + 4, len));
    this.#exports.dealloc(result, 4 + len);
    return text;
  }
}

export type WasmSource = BufferSource | WebAssembly.Module | Response | Promise<Response> | URL;

// Built output sits next to the wasm in dist/; the source tree keeps it one level up.
const WASM_URL = new URL(import.meta.url.includes('/src/') ? '../dist/isnot_lenses.wasm' : './isnot_lenses.wasm', import.meta.url);

/** Instantiate the lenses. With no argument, loads the wasm shipped in this package. */
export async function loadLenses(source?: WasmSource): Promise<Lenses> {
  const src = source ?? WASM_URL;
  let bytes: BufferSource | WebAssembly.Module;
  if (src instanceof URL && src.protocol === 'file:') {
    const [{ readFile }, { fileURLToPath }] = await Promise.all([import('node:fs/promises'), import('node:url')]);
    bytes = await readFile(fileURLToPath(src));
  } else if (src instanceof URL || src instanceof Response || src instanceof Promise) {
    bytes = await (src instanceof URL ? fetch(src) : src).then((r) => r.arrayBuffer());
  } else {
    bytes = src;
  }
  const { instance } = bytes instanceof WebAssembly.Module
    ? { instance: await WebAssembly.instantiate(bytes, {}) }
    : await WebAssembly.instantiate(bytes, {});
  return new Lenses(instance);
}

const recordUri = /^at:\/\/([^/]+)\/([^/]+)\/([^/]+)$/;

/** Fetch a record by at-uri: resolves the DID document, finds the PDS, calls getRecord. */
export async function fetchRecord(uri: string, fetchImpl: typeof fetch = fetch): Promise<{ cid: string; record: unknown }> {
  const match = recordUri.exec(uri);
  if (!match) throw new Error(`not a record at-uri: ${uri}`);
  const [, did, collection, rkey] = match;
  const url = new URL('/xrpc/com.atproto.repo.getRecord', await pdsFor(did, fetchImpl));
  url.searchParams.set('repo', did);
  url.searchParams.set('collection', collection);
  url.searchParams.set('rkey', rkey);
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`getRecord failed for ${uri}: ${res.status}`);
  const body = (await res.json()) as { cid: string; value: unknown };
  return { cid: body.cid, record: body.value };
}

async function pdsFor(did: string, fetchImpl: typeof fetch): Promise<string> {
  let docUrl: string;
  if (did.startsWith('did:plc:')) docUrl = `https://plc.directory/${did}`;
  else if (did.startsWith('did:web:')) docUrl = `https://${decodeURIComponent(did.slice('did:web:'.length))}/.well-known/did.json`;
  else throw new Error(`unsupported DID method: ${did}`);
  const res = await fetchImpl(docUrl);
  if (!res.ok) throw new Error(`DID resolution failed for ${did}: ${res.status}`);
  const doc = (await res.json()) as { service?: { id: string; serviceEndpoint: string }[] };
  const pds = doc.service?.find((s) => s.id === '#atproto_pds');
  if (!pds) throw new Error(`no PDS in DID document for ${did}`);
  return pds.serviceEndpoint;
}

/** Fetch the subject record and assemble a complete at.isnot.tag record. */
export async function buildTag(
  lenses: Lenses,
  input: { uri: string; direction: Direction; adjective: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ record: TagRecord; supported: boolean }> {
  const { cid, record } = await fetchRecord(input.uri, fetchImpl);
  const resolution = lenses.resolveSubject({ uri: input.uri, cid, record });
  if ('error' in resolution) throw new Error(resolution.error);
  return {
    supported: resolution.supported,
    record: {
      $type: 'at.isnot.tag',
      subject: resolution.subject,
      adjective: input.adjective,
      direction: input.direction,
      updatedAt: new Date().toISOString(),
    },
  };
}
```

- [ ] **Step 5: Run the tests**

Run from `packages/lenses`: `sh build-wasm.sh && pnpm exec vp test --run`
Expected: all tests PASS. Then `pnpm exec vp pack` and confirm `dist/index.js`, `dist/index.d.ts` exist and `dist/isnot_lenses.wasm` is still present (pack must not clean `dist/`; if it does, set `pack.clean: false` in `vite.config.ts` and re-run the build script).

- [ ] **Step 6: README**

`packages/lenses/README.md`:

```markdown
# @is-not/lenses

Turns an atproto record into an `at.isnot.tag` subject. The mapping for each supported
collection is a [panproto](https://panproto.dev) lens document under `lenses/`, compiled
with the engine into one WebAssembly module that runs in browsers, Node and Go.

```ts
import { buildTag, loadLenses } from '@is-not/lenses';

const lenses = await loadLenses();
const { record, supported } = await buildTag(lenses, {
  uri: 'at://did:plc:ephkzpinhaqcabtkugtbzrwu/social.popfeed.feed.review/3lsdno2qnoc2g',
  direction: 1,
  adjective: 'thrilling',
});
```

`resolveSubject({ uri, cid, record })` runs the lens directly; `supported: false` means no
lens exists for that collection and the subject is a best guess from common field names.

## Adding a lens

Add `lenses/<nsid>.json`, the source lexicon under `lexicons/`, a fixture under
`testdata/<nsid>/`, and one entry in `SOURCES` in `src/lib.rs`. Lenses may use
`rename_field`, `remove_field` (not on arrays) and `apply_expr`. Name the identifiers object
in `extensions["at.isnot"]["identifiers"]`; panproto currently drops ref-typed properties.

## Wasm ABI

`alloc(len) -> ptr`, `dealloc(ptr, len)`, `resolve_subject(ptr, len) -> ptr`,
`supported_collections() -> ptr`. Results are `[u32 little-endian len][utf-8 JSON]`; free
them with `dealloc(ptr, 4 + len)`. Not thread-safe: serialise calls per instance.

## Building

`pnpm build` runs `build-wasm.sh` (rustup toolchain, `wasm32-unknown-unknown`, `wasm-opt`)
then `vp pack`. `pnpm test` runs the Rust and TypeScript suites over the shared fixtures in
`testdata/`.
```

- [ ] **Step 7: Commit**

```bash
git add packages/lenses/package.json packages/lenses/vite.config.ts packages/lenses/tsconfig.json packages/lenses/src/index.ts packages/lenses/src/index.test.ts packages/lenses/README.md .changeset/first-lenses.md pnpm-lock.yaml
git commit -m "feat(lenses): @is-not/lenses TypeScript wrapper

loadLenses, resolveSubject, fetchRecord and buildTag over the wasm ABI,
usable in browsers and Node."
```

---

### Task 4: Go wrapper on wazero and the fetch script

**Files:**
- Create: `lens.go`, `lens_test.go`, `scripts/fetch-lenses.sh`
- Modify: `go.mod`, `go.sum` (wazero), `CLAUDE.md`

**Interfaces:**
- Consumes: `packages/lenses/dist/isnot_lenses.wasm` (built by Task 2's script) and the fixtures.
- Produces: `loadLenses(ctx) (*lenses, error)`, `(*lenses).resolveSubject(ctx, uri, cid string, record map[string]any) (resolution, error)`, `(*lenses).supportedCollections(ctx) ([]string, error)`, `(*lenses).Close(ctx) error`; types `subject`, `identifier`, `resolution`.

- [ ] **Step 1: Write the failing test**

`lens_test.go`:

```go
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
```

- [ ] **Step 2: Run the test to see it fail**

Run: `go test ./... -run 'TestLenses|TestResolveSubject'`
Expected: FAIL to compile: `undefined: loadLenses`.

- [ ] **Step 3: Implement lens.go**

```go
package main

import (
	"context"
	_ "embed"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"sync"

	"github.com/tetratelabs/wazero"
	"github.com/tetratelabs/wazero/api"
)

// Built by packages/lenses/build-wasm.sh or downloaded by scripts/fetch-lenses.sh.
//
//go:embed packages/lenses/dist/isnot_lenses.wasm
var lensesWasm []byte

type identifier struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

type subject struct {
	URI         string       `json:"uri"`
	CID         string       `json:"cid"`
	Title       string       `json:"title"`
	Type        string       `json:"type"`
	Identifiers []identifier `json:"identifiers,omitempty"`
}

type resolution struct {
	Supported bool    `json:"supported"`
	Subject   subject `json:"subject"`
	Error     string  `json:"error,omitempty"`
}

type lenses struct {
	runtime wazero.Runtime
	mod     api.Module
	// ponytail: one instance behind a mutex; the wasm allocator is not thread-safe.
	// Pool instances if resolve latency ever matters.
	mu sync.Mutex
}

func loadLenses(ctx context.Context) (*lenses, error) {
	r := wazero.NewRuntime(ctx)
	mod, err := r.Instantiate(ctx, lensesWasm)
	if err != nil {
		r.Close(ctx)
		return nil, fmt.Errorf("instantiate lenses: %w", err)
	}
	return &lenses{runtime: r, mod: mod}, nil
}

func (l *lenses) Close(ctx context.Context) error { return l.runtime.Close(ctx) }

func (l *lenses) resolveSubject(ctx context.Context, uri, cid string, record map[string]any) (resolution, error) {
	input, err := json.Marshal(map[string]any{"uri": uri, "cid": cid, "record": record})
	if err != nil {
		return resolution{}, err
	}
	out, err := l.call(ctx, "resolve_subject", input)
	if err != nil {
		return resolution{}, err
	}
	var res resolution
	if err := json.Unmarshal(out, &res); err != nil {
		return resolution{}, err
	}
	if res.Error != "" {
		return res, errors.New(res.Error)
	}
	return res, nil
}

func (l *lenses) supportedCollections(ctx context.Context) ([]string, error) {
	out, err := l.call(ctx, "supported_collections", nil)
	if err != nil {
		return nil, err
	}
	var cols []string
	return cols, json.Unmarshal(out, &cols)
}

// call runs an exported function over the buffer ABI and returns a copy of its result.
func (l *lenses) call(ctx context.Context, fn string, input []byte) ([]byte, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	mem := l.mod.Memory()
	var args []uint64
	if input != nil {
		p, err := l.mod.ExportedFunction("alloc").Call(ctx, uint64(len(input)))
		if err != nil {
			return nil, err
		}
		if !mem.Write(uint32(p[0]), input) {
			return nil, errors.New("lenses: input write out of range")
		}
		defer l.mod.ExportedFunction("dealloc").Call(ctx, p[0], uint64(len(input)))
		args = []uint64{p[0], uint64(len(input))}
	}
	res, err := l.mod.ExportedFunction(fn).Call(ctx, args...)
	if err != nil {
		return nil, fmt.Errorf("lenses %s: %w", fn, err)
	}
	ptr := uint32(res[0])
	header, ok := mem.Read(ptr, 4)
	if !ok {
		return nil, errors.New("lenses: result header out of range")
	}
	n := binary.LittleEndian.Uint32(header)
	view, ok := mem.Read(ptr+4, n)
	if !ok {
		return nil, errors.New("lenses: result out of range")
	}
	// wazero returns a view into module memory, which dealloc may reuse; copy first.
	out := append([]byte(nil), view...)
	_, err = l.mod.ExportedFunction("dealloc").Call(ctx, uint64(ptr), uint64(4+n))
	return out, err
}
```

Then: `go get github.com/tetratelabs/wazero@latest && go mod tidy`.

- [ ] **Step 4: Run the tests**

Run: `gofmt -l . && go vet ./... && go test ./...`
Expected: all PASS (the wasm from Task 2 must exist at `packages/lenses/dist/isnot_lenses.wasm`).

- [ ] **Step 5: Fetch script and CLAUDE.md**

`scripts/fetch-lenses.sh`:

```sh
#!/bin/sh
# Downloads the released lenses wasm matching packages/lenses/package.json so Go
# builds need no Rust toolchain. Local alternative: sh packages/lenses/build-wasm.sh
set -eu
cd "$(dirname "$0")/.."
VERSION=$(sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' packages/lenses/package.json | head -1)
URL="https://github.com/jphastings/is-not/releases/download/lenses-v${VERSION}/isnot_lenses.wasm"
mkdir -p packages/lenses/dist
curl -fsSL -o packages/lenses/dist/isnot_lenses.wasm "$URL"
echo "fetched @is-not/lenses ${VERSION}"
```

`chmod +x scripts/fetch-lenses.sh`.

In `CLAUDE.md`, under "## Working here" add:

```markdown
- The Go build embeds `packages/lenses/dist/isnot_lenses.wasm`, which is git-ignored. Before `go build` or `go test`, either build it (`sh packages/lenses/build-wasm.sh`, needs rustup with the wasm32 target and wasm-opt) or download the released one (`scripts/fetch-lenses.sh`).
- JavaScript lives in a pnpm workspace with Vite+: `pnpm install`, `pnpm test`, `pnpm check`. Package versions use changesets (`pnpm changeset`).
```

Under "## Things that cost time" add:

```markdown
- Homebrew's cargo shadows rustup on JP's Mac and cannot target wasm32. `build-wasm.sh` forces rustup's toolchain; do the same for any new Rust build step.
- panproto's lens `get` drops ref-typed properties and `remove_field` fails on arrays (bean ISNOT-qvqp). Lenses name identifiers in `extensions` instead.
```

- [ ] **Step 6: Commit**

```bash
git add lens.go lens_test.go scripts/fetch-lenses.sh go.mod go.sum CLAUDE.md
git commit -m "feat: run the lenses wasm from Go with wazero

Pure Go, no cgo. The artifact is fetched from the lenses release rather
than committed, so the API tracks the published lens version."
```

---

### Task 5: GitHub workflow for test, publish and release

**Files:**
- Create: `.github/workflows/lenses.yml`

**Interfaces:**
- Consumes: package scripts from Task 3, `build-wasm.sh`, changesets config.
- Produces: on push to `main`, a "Version Packages" PR via changesets; on merging it, npm publish and a GitHub release `lenses-v<version>` with `isnot_lenses.wasm` attached.

- [ ] **Step 1: Write the workflow**

`.github/workflows/lenses.yml`:

```yaml
name: lenses

on:
  push:
    branches: [main]
    paths: ['packages/lenses/**', '.changeset/**', 'lens.go', 'lens_test.go', 'go.mod', '.github/workflows/lenses.yml']
  pull_request:
    paths: ['packages/lenses/**', '.changeset/**', 'lens.go', 'lens_test.go', 'go.mod', '.github/workflows/lenses.yml']

env:
  BINARYEN_VERSION: version_123

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: wasm32-unknown-unknown
      - uses: Swatinem/rust-cache@v2
        with:
          workspaces: packages/lenses
      - name: Install wasm-opt
        run: |
          curl -fsSL "https://github.com/WebAssembly/binaryen/releases/download/${BINARYEN_VERSION}/binaryen-${BINARYEN_VERSION}-x86_64-linux.tar.gz" | tar xz
          echo "$PWD/binaryen-${BINARYEN_VERSION}/bin" >> "$GITHUB_PATH"
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @is-not/lenses build
      - run: pnpm --filter @is-not/lenses test
      - uses: actions/setup-go@v5
        with:
          go-version-file: go.mod
      - run: go test ./...
      - uses: actions/upload-artifact@v4
        with:
          name: isnot_lenses.wasm
          path: packages/lenses/dist/isnot_lenses.wasm

  release:
    if: github.event_name == 'push'
    needs: test
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: wasm32-unknown-unknown
      - uses: Swatinem/rust-cache@v2
        with:
          workspaces: packages/lenses
      - name: Install wasm-opt
        run: |
          curl -fsSL "https://github.com/WebAssembly/binaryen/releases/download/${BINARYEN_VERSION}/binaryen-${BINARYEN_VERSION}-x86_64-linux.tar.gz" | tar xz
          echo "$PWD/binaryen-${BINARYEN_VERSION}/bin" >> "$GITHUB_PATH"
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
          registry-url: https://registry.npmjs.org
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @is-not/lenses build
      - id: changesets
        uses: changesets/action@v1
        with:
          publish: pnpm changeset publish
          version: pnpm changeset version
          title: 'chore: version packages'
          commit: 'chore: version packages'
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
          NPM_CONFIG_PROVENANCE: true
      - name: Attach wasm to a GitHub release
        if: steps.changesets.outputs.published == 'true'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          VERSION=$(node -p "require('./packages/lenses/package.json').version")
          gh release create "lenses-v${VERSION}" packages/lenses/dist/isnot_lenses.wasm \
            --title "@is-not/lenses ${VERSION}" \
            --notes "Built from packages/lenses at ${GITHUB_SHA}. Download isnot_lenses.wasm for Go builds via scripts/fetch-lenses.sh."
```

- [ ] **Step 2: Validate the YAML and commit**

```bash
python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/lenses.yml')); print('yaml ok')" 2>/dev/null || ruby -ryaml -e "YAML.load_file('.github/workflows/lenses.yml'); puts 'yaml ok'"
git add .github/workflows/lenses.yml
git commit -m "ci: test, publish and release the lenses package

Changesets opens the version PR and publishes to npm; a GitHub release
tagged lenses-v<version> carries the wasm for Go builds."
```

Note for JP (not a step): the repo needs an `NPM_TOKEN` secret with publish rights on `@is-not`, and the workflow only runs once the repo is on GitHub.

---

### Task 6: Lens authoring guide

**Files:**
- Create: `docs/creating-a-lens.md`

**Interfaces:**
- Consumes: the package layout from Tasks 2–3, the release flow from Task 5.

- [ ] **Step 1: Write the guide**

`docs/creating-a-lens.md` explains, for a contributor who has never seen this repo, how to add support for a new atproto collection and ship it as a new `@is-not/lenses` version in one self-contained commit or PR. It must cover, in order: finding and vendoring the source lexicon verbatim under `packages/lenses/lexicons/`; fetching a real record with `getRecord` to use as a fixture; writing `packages/lenses/lenses/<nsid>.json` (the allowed steps, the `apply_expr` if-chain for type mapping, the `extensions["at.isnot"]["identifiers"]` convention and why, the array limitation); adding the `SOURCES` entry in `src/lib.rs`; writing the fixture with the exact expected output; running `cargo test`, `sh build-wasm.sh`, `pnpm exec vp test --run` and `go test ./...`; adding a changeset (`pnpm changeset`, minor bump for a new lens) and what the workflow does with it once merged (version PR, npm publish, `lenses-v<version>` GitHub release); and a checklist of what the commit must contain. Include one complete worked example using a hypothetical `com.example.book` lexicon with `title`, `kind` ∈ {novel, comic} mapped to `book`/`book-series`... no: keep it honest — map `novel → book` and pass `comic` through, and an `ids` object for identifiers. Keep it under 200 lines, no fluff.

- [ ] **Step 2: Commit**

```bash
git add docs/creating-a-lens.md
git commit -m "docs: guide for adding a lens and releasing it"
```
