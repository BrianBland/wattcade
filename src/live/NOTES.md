# Live updates (src/live)

Ride a game and take new versions of it as they land on main, without reloading: no Bluetooth reconnect, no lost run.

**Publish** (`.github/workflows/live.yml`, every push to main, no CI wait): `LIVE_BASE=<version URL> vite build` turns each
`src/games/<id>/index.ts` into an entry chunk (`scripts/live/vitePlugin.ts`) and writes `live/build.json` with content hashes
of each game's sim side (static imports, tunable defaults blanked), renderer side (what `loadRenderer` pulls in) and the shell
(everything else). `scripts/live/manifest.ts` adds each game's tunable defaults (headless 2-min run) and `snapshotFormat`,
writes `live/manifest.json`, and appends the version to `live/feed.json` (last 60). Uploaded twice: alias `c-<sha8>` (the
version) and alias `live` (the feed). `public/_headers` makes it all CORS-readable from the prod origin.

**Client** (Settings → Live updates, per profile): `client.ts` polls the feed every 20 s and `import()`s a version's game
chunk from its URL (absolute base, so chunks/assets/workers resolve there; module workers get a same-origin blob shim).
Each game has three layers pinned per profile in localStorage (`store.ts`): sim, render, tuning (null = built-in).
- tuning: `TuningRegistry.applyDefaults` moves untouched tunables at once; rider overrides stay.
- art: GameHost unmounts the renderer and mounts the version's, same sim; only when `snapshotFormat` matches the running sim.
- logic: pinned; a game with `GameSim.checkpoint()` hands over mid-ride when it returns state (Dynamo: in the Garage,
  between runs): the save is backed up, `session.swapSim(mod, state)` starts the new sim with `{resume: state}`, and the
  renderer follows if its pin or `snapshotFormat` needs it. Games without checkpoints take it on the next start.
  "Skip logic" leaves the sim where it is (skipped hash kept).
- shell changes: flagged in the tray; they need a reload (not offered mid-ride).
`feed.ts` holds the pure rules (`planApply`, `pendingFor`, `gameHistory`); `host.ts` applies them to a running game;
`ui.tsx` is the chip (top right while riding) and the pause menu's Versions list (rollback, "Built-in copy", save backups).
When the sim layer changes between starts, the game's save is backed up first (last 5); "Restore next start" brings one back.

**Rules for game code**: balance numbers belong in tunables (a default-only change is a tuning change); bump
`GameModule.snapshotFormat` when a snapshot change would break a renderer from the other side. A version's game chunk
carries its own copies of shared code; only `audio/sfx` and `audio/voices` forward to the page (`shared.ts`, matching
`SHARED_MODULES`), so other module-level state isn't shared with the shell.

**Known limits**: public-dir assets referenced with literal `/path` (Scrapjet's `/scrapjet/`) still load from prod;
`BASE_URL` ones load from the version. Only Dynamo has a checkpoint so far. After each publish CI runs
`scripts/live/smoke.ts`: headless Chrome on the live origin imports every game chunk and its renderer cross-origin. `LIVE_DEBUG=1` adds `live/shell-modules.json` for hash debugging.

Tests: `feed.test.ts`, `store.test.ts`, `build.test.ts`, `src/core/tuningLive.test.ts`, swapSim in `src/core/core.test.ts`,
Garage checkpoint in `src/games/towerdefense/test/sim.test.ts`.
