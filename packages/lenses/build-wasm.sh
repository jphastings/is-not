#!/bin/sh
# Builds dist/isnot_lenses.wasm. Uses rustup's toolchain explicitly because
# Homebrew's cargo can shadow it and lacks the wasm32 target. RUST_TOOLCHAIN
# picks the rustup toolchain (the Docker rust image has no "stable" alias).
set -eu
cd "$(dirname "$0")"
TOOLCHAIN="${RUST_TOOLCHAIN:-stable}"
if command -v rustup >/dev/null 2>&1; then
  RUSTC="$(rustup which rustc --toolchain "$TOOLCHAIN")"
  export RUSTC
  PATH="$(dirname "$RUSTC"):$PATH"
  export PATH
  CARGO="rustup run $TOOLCHAIN cargo"
else
  CARGO=cargo
fi
$CARGO build --release --target wasm32-unknown-unknown
mkdir -p dist
# --all-features lets wasm-opt rewrite calls into call_ref (function-references
# proposal), which wazero's CoreFeaturesV2 runtime can't instantiate. Pin the
# feature set to what wazero actually supports instead.
wasm-opt -Oz \
  --enable-bulk-memory --enable-multivalue --enable-nontrapping-float-to-int \
  --enable-reference-types --enable-sign-ext --enable-mutable-globals --enable-simd \
  -o dist/isnot_lenses.wasm target/wasm32-unknown-unknown/release/isnot_lenses.wasm
ls -l dist/isnot_lenses.wasm
