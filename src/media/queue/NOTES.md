# media/queue — shared queue model (#65/#66 step 1)

- Pure, no DOM/IDB: TrackOrigin, QueueEntry, TrackBatch, applyBatch (append/replace/{after}, dedupe skip|allow, maxTracks),
  persisted queue v2, SavedSelection v1 helpers. Design: wattcade bulk-add plan (step 1).
- Origin is per queue entry; batch.origins[i] overrides batch.origin (playlist index).
- Dedupe key: provider:providerId when known, else song id (online ids are already `<provider>:<id>`). Cross-provider matching: no.
- Queue key `wattcade.media.queue.<profileId>` now `{v:2, entries, mode}`; anything else is ignored and cleared (no migration).
- Selections are profile-bound snapshots; unknown `v` records are skipped, not rewritten. No IDB store yet (comes with #65 UI).
- PLAYLIST_IMPORT_LIMIT = 100, kept in step with resolver MAX_PLAYLIST_ITEMS.
- Wiring: MediaPicker reads/writes v2 (entries saved as manual origin); RollingQueue still gets ids. src/contracts.ts untouched.
- Tests: queue.test.ts.
