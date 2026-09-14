//! at.isnot lenses: turns an atproto record into an `at.isnot.tag` subject.
//! Built as a wasm cdylib with a plain buffer ABI; see the package README.

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
