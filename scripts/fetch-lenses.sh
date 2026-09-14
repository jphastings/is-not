#!/bin/sh
# Downloads the released lenses wasm matching packages/lenses/package.json so Go
# builds need no Rust toolchain. Local alternative: sh packages/lenses/build-wasm.sh
set -eu
cd "$(dirname "$0")/.."
VERSION=$(sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' packages/lenses/package.json | head -1)
URL="https://github.com/jphastings/isnot/releases/download/lenses-v${VERSION}/isnot_lenses.wasm"
mkdir -p packages/lenses/dist
curl -fsSL -o packages/lenses/dist/isnot_lenses.wasm "$URL"
echo "fetched @is-not/lenses ${VERSION}"
