---
# ISNOT-oegf
title: 'Site foundation: SvelteKit, shadcn, OAuth BFF, homepage, profiles'
status: todo
type: feature
created_at: 2026-09-13T16:23:18Z
updated_at: 2026-09-13T16:23:18Z
parent: ISNOT-kgev
---

web/: SvelteKit + TypeScript, vite-plus on pnpm, shadcn. atproto OAuth in the BFF with multiple signed-in accounts (own writable SQLite for sessions). Reads the shared SQLite file read-only (needs write access to -wal/-shm). Homepage: big bold sentence rotating through 10 random tags loaded with the page, 15s cadence with animation. Profile pages /handle and /did:* (did canonical in metadata), 200 empty state for unknown users. Branding chosen in the design pass with impeccable skills.
