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
