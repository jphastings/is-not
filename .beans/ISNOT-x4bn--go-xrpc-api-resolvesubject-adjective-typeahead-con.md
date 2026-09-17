---
# ISNOT-x4bn
title: 'Go XRPC API: resolveSubject, adjective typeahead, container'
status: todo
type: feature
priority: normal
created_at: 2026-09-13T16:23:18Z
updated_at: 2026-09-14T22:17:49Z
parent: ISNOT-kgev
---

XRPC endpoints via atmos xrpcserver on its own port (api.isnot.at):         
at.isnot.resolveSubject (resolve DID -> PDS, getRecord, run lenses wasm via 
wazero; unsupported NSID returns best-guess + unsupported flag), adjective  
typeahead returning a large list (user's most used + ecosystem most popular)
for client-side filtering/caching, random tags sample for the homepage (join review_tags to reviews).     
Dockerfile for the API.                                                     
                                                                            
Notes from the subject/accounts review (2026-09-13): Subject metadata is canonical in the `subjects` table (lensed server-side at ingest, spec 2026-09-17); the XRPC resolveSubject endpoint can reuse `ingester.lensSubject`. subject_identifiers is unindexed JSON text; add a
generated column or side table when identifier matching is needed. Add an   
index on reviews(updated_at) with the first recent-tags feed. Keep the         
invariant                                                                   
that nothing queries the DB inside the fold transaction                     
(SetMaxOpenConns(1)); an XRPC read pool must not change that.               
                                                                            
From the lenses review (2026-09-14): bound the size of records passed to    
resolveSubject at the XRPC boundary (a huge record could drive the wasm     
allocator into an abort). lens.go re-instantiates the module after a trapped
call.                                                                       

Lexicon change 2026-09-15: records are at.isnot.review (one per subject, tags array, createdAt/updatedAt). Add an endpoint to fetch the caller's existing review for a subject_uri so the /tag page can update rather than duplicate.
