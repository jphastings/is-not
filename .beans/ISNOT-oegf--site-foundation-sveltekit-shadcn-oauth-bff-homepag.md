---
# ISNOT-oegf
title: 'Site foundation: SvelteKit, shadcn, OAuth BFF, homepage'
status: completed
type: feature
priority: normal
created_at: 2026-09-13T16:23:18Z
updated_at: 2026-09-15T21:57:28Z
parent: ISNOT-kgev
---

web/: SvelteKit + TypeScript, vite-plus on pnpm, shadcn. atproto OAuth in the BFF with multiple signed-in accounts (own writable SQLite for sessions). Reads the shared SQLite file read-only via node:sqlite (already wired: web/src/lib/server/db.ts). Homepage rotating 10 random tags exists as an unstyled scaffold from the Railway release work (ISNOT-jqpi); this bean adds OAuth, shadcn and the design pass with impeccable skills. Keep web/ runnable with zero node_modules (see CLAUDE.md).



Per-account review pages moved to ISNOT-ccxb (/reviews/{did}).
