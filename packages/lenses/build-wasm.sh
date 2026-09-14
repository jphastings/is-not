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
