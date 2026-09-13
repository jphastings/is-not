---
# ISNOT-sq4b
title: 'Lenses package: panproto lenses compiled to wasm'
status: todo
type: feature
created_at: 2026-09-13T16:23:18Z
updated_at: 2026-09-13T16:23:18Z
parent: ISNOT-kgev
---

packages/lenses: Rust cdylib embedding panproto lens JSON documents and vendored source lexicons, exposing (uri, cid, record) -> at.isnot.tag subject via a plain buffer ABI. Built for wasm32-unknown-unknown, wasm-opt -Oz --all-features (~340KB gz). Thin TypeScript wrapper published to npm with changesets. First lens: social.popfeed.feed.review (title, creativeWorkType -> type with tv_show/tv_episode mapping, identifiers via extensions workaround, see ISNOT-qvqp). Homebrew cargo shadows rustup: build via rustup run stable with RUSTC set.
