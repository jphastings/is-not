---
# ISNOT-7yz5
title: Re-resolve accounts with empty handles periodically
status: todo
type: task
created_at: 2026-09-13T16:48:46Z
updated_at: 2026-09-13T16:48:46Z
parent: ISNOT-kgev
---

A DID whose first-sight resolution failed keeps handle='' forever (only a jetstream identity event repairs it). Before launch, add a periodic pass over accounts WHERE handle = '' that re-resolves via the identity Directory (call dir.Purge first if the DID is cached). Also consider re-verifying handles that arrive via identity events, which are currently trusted as-is from the relay.
