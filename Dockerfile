# syntax=docker/dockerfile:1

# 1. Lenses: panproto lens engine compiled to wasm, embedded by the Go binary.
FROM rust:1-slim-bookworm AS wasm
ARG BINARYEN_VERSION=version_130
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/* \
 && curl -fsSL "https://github.com/WebAssembly/binaryen/releases/download/${BINARYEN_VERSION}/binaryen-${BINARYEN_VERSION}-$(uname -m)-linux.tar.gz" | tar xz -C /opt \
 && ln -s "/opt/binaryen-${BINARYEN_VERSION}/bin/wasm-opt" /usr/local/bin/wasm-opt \
 && rustup target add wasm32-unknown-unknown
WORKDIR /src/packages/lenses
COPY packages/lenses/Cargo.toml packages/lenses/Cargo.lock packages/lenses/build-wasm.sh ./
COPY packages/lenses/src src
COPY packages/lenses/lenses lenses
COPY packages/lenses/lexicons lexicons
RUN RUST_TOOLCHAIN="$(rustup show active-toolchain | cut -d" " -f1)" sh build-wasm.sh

# 2. API: static Go binary.
FROM golang:1.26-bookworm AS api
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY *.go ./
COPY lexicons lexicons
COPY migrations migrations
COPY --from=wasm /src/packages/lenses/dist/isnot_lenses.wasm packages/lenses/dist/isnot_lenses.wasm
RUN CGO_ENABLED=0 go build -o /isnot .

# 3. Site: SvelteKit built with adapter-node; runs without node_modules.
FROM node:24-bookworm-slim AS web
RUN npm install -g pnpm@11
WORKDIR /src
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY web/package.json web/
RUN pnpm install --frozen-lockfile --filter web
COPY web web
RUN pnpm --filter web build

# 4. Runtime: both processes, one SQLite file on the volume.
FROM node:24-bookworm-slim
COPY --from=api /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=api /isnot /usr/local/bin/isnot
COPY --from=web /src/web/build /app/web
COPY scripts/start.sh /usr/local/bin/start.sh
ENV NODE_ENV=production PORT=8080 WEB_PORT=3000 DATABASE_PATH=/data/isnot.db
EXPOSE 8080 3000
CMD ["start.sh"]
