# Dynamo Defense (towerdefense)
CONTRACT-REQUESTs: none.

## Seams
- Single road (#163): `sim/road.ts` is the one geometry source (spline road from the hive mouth, 8 pads, Glider flight spawns, paint boxes); `sim/defs.ts` derives `roadAt`/`flightAt`/`PADS`/`BASE_PAD`. Gliders fly straight to the turret. `waves.ts`: sets of 3 work waves, a boss, an easy wave; brood order, packs, forecast counts, clear healing.
- `sim/boss.ts` and `sim/efforts.ts` retain #140’s HP-gated boss ladder, stagger/Exposed timing, and seeded spin/grind/hold calls. Live matchups and fuel-blooded ignition retain turret/tower attribution.
- `sim/targeting.ts`: soonest-arriving brood-colour target; ◀▶/paddles step a decaying lock closer/further along the queue. Turret reach `turretRange` 75 (Flamer: `flameRange`, ground only) leaves the upper road to towers. Shifters stay virtual gears.
- `sim/construction.ts`: pure, affordable build/upgrade/repair recommendation, weighted by off-colour danger, live matchups and existing coverage; resisted choices are excluded. Upgrade orders quote the final level and total cost, including multiple levels when funded.
- `sim/types.ts`: additive snapshot fields `actions`, `refill`, `slowFrom`, `set`, `lock`, `burns`, `suggestion`, `constructionDone`, `autoCrew`, `inputEpoch`; workshop adds `revision`. These are the sim/renderer seam for #126.
- The shell owns filled action controls in its existing HUD band: controller keys when legends are on, compact blocks when off. `render/layout.ts` reclaims the canvas dock space under `mount.hudControls`; bare renderers retain a fallback dock. The radial workshop stays above the actual inset.
- HUD (#126): `render/panels.ts` uses shared CSS tokens, glass panels and inherited font for wave/progress, HP/cores, scrap, current brood/mode and next forecast. No weapon list or duplicate power/controller HUD. Recovery replaces the forecast with a countdown/recover-or-ramp cue in the same brood strip, including while the workshop is open; no centered recovery card. Layout tests cover shell and standalone modes vs insets.
- `render/aliens/` (#132): cut-out puppets with distance-based gaits, cached device-pixel frames, live boss poses, husks, brood splats and fire bursts; vector enemies remain the loading fallback. Assets: `public/td/aliens/`, packed by `scripts/td-pack-aliens.ts`.
- Painted battlefield, animated machinery, connected conduits, hive entries, loading gate and portrait margins: `render/NOTES.md`.

## Play and controls (#119, #120, #122, #123)
- Every wave has one brood/weapon/trainer mode. Its 15 s lull announces the coming wave and ramps the trainer over the last 6 s. During that lull `brood` is the incoming wave; `nextBrood` is one wave further ahead.
- A accepts the displayed work order during a lull, otherwise opens construction. ▼ always opens the full workshop. It never auto-opens.
- Auto-crew defaults ON and accepts one order at the lull's end. Commander mode OFF requires one acceptance per lull. A successful manual build/upgrade/repair consumes that lull's crew order; an open workshop prevents automatic spending. Overrides remain available throughout combat.
- Workshop: ◀▶ pads/base, ▲▼ option, A confirm, B close (10 s idle timeout). Tap pads/base to open, then tap build/upgrade/sell/repair or the saved Auto-crew toggle. Touch and controller share selection and purchase state.
- B Overcharge: towers fire x1.5 for 10 s; 60 s base cooldown. Y Slow field: ground aliens on the back 55% of the road move 40% slower for 8 s; 50 s base cooldown. They are optional; unusable actions consume nothing.
- Hold ▲ (or the HUD’s Sprint boost touch key) during a Rail boss telegraph/opening for the optional ERG push. A remains construction; menu/pause/cancel clears both gesture types.
- Z Rail: tap = one stored charge, hold 0.5 s = all. Touch and controller share a gesture; cancel/drag away/lost capture/blur/pause/menu changes discard it. Stock still requires >= 0.75 FTP (20 s nominal, max 3), independent of cooldown refill.
- Overcharge/Slow use shared `core/cooldown.ts` refill at `min(5, powerZone)` and shared fill-up buttons. A sprint edge completes those cooldowns once, without creating rail stock. Every action parameter is a `towerdefense.*` tunable. Overcharge stacks with sprint Overdrive's tower-speed multiplier.
- Combat inputs are consumed while construction is open. Stale menu revisions/epochs/quotes and same-tick touch/controller duplicates cannot buy twice. The shell sends `inputCancel` on pause to discard queued input and resume edges.
- Flamer lobs fireballs (burst + burning road, `burnShare`); the Flame Tower (replaces the Mortar; Mortar art stands in) is a short ground-only cone. ◀▶/paddles step the target lock; ▲ releases it. Repair remains a scrap purchase; cooldown Field Repair is deferred by owner choice.

## Saves and balance
- Save v3 (`readSave` in `sim/sim.ts`) keeps bank, upgrades, best wave and Auto-crew from legacy and v2 saves, and drops core fields. A fall or bail banks parts already earned and returns to the Garage; `isOver()` stays false. The shell pause menu offers **Return to Garage · bank parts** during a run.
- `autopilot` no longer fires combat actions or purchases every 1.5 s; `actionBot` explicitly opts into sparse actions, and `autoCrew` can be overridden in headless tests.
- The `surge-ready-deep` achievement fixture uses `actionBot`, hook-responsive riding and a reinforced base (`simOpts.baseHp`) to reach wave 40. `wavesSurvived` is the best single run, so a later fall does not erase it. Passive survival remains measured separately.
- Waves are ~2 min work intervals with a 45 s lull (`waveMinS` 90, `waveMaxS` 150, `easyWaveS` 120); one called effort per work wave. HP and counts were rescaled for ~12 waves per 30 min; achievements rescaled (8/15/22 waves, 10 bosses, 8 spotless, 10 surges).
- FTP 200 z2, seeds 1–4, `towerDamageMult` 1.1: passive falls at 29–34 min (w10–12), active 32–58 min; full-run turret share 49–56%. Survival is sensitive near this point (1.15–1.25 gave 28–64 min); needs a dedicated balance pass.

## Verification and device check
- Shaped HUD coverage grows the field into clear space between hoods while keeping road sprites, towers, gliders and turret clear; menus keep the conservative band. `node scripts/towerdefense-layout-smoke.mjs` verifies actual geometry in four sizes/both modes; screenshots `/tmp/towerdefense-layout`. Short landscape uses a status column at usable height ≥200px.
- `npx tsc --noEmit -p .`; `npx vitest run src/games/towerdefense` covers action effects/refill/sprint edges, commander/crew saves, stale/double purchases, mixed input, held Rail cancellation, layout/insets and four-seed passive/active scenarios.
- `npm run dev -- --port 5203`, then `node scripts/towerdefense-hud-smoke.mjs`: both HUD modes at landscape/portrait/phone/short sizes, mixed upgrades, fills, Rail holds/cancel/toggle and boss boost; screenshots in `/tmp/towerdefense-hud`. The renderer smoke separately covers the no-shell fallback.
- Interactive harness: `/dev/towerdefense.html?crew=0&legend=0` (L=A, K=B, I=Y, J=Z, hold Arrow Up for boss boost); `manual=1` exposes `window.__td.advance(seconds)` for repeatable browser checks; `boss=1&seed=2` starts a control demo at wave 5 with a reduced Rail laser.
- #126 visual checks: 2x touch-enabled Chromium captures at 1180×820, 820×1180 and 390×844 for combat/recovery/workshop, with real `HudLayer`; DOM bounds/overflow and clear recovery map checked. Recorded a manual recovery build with the countdown visible. Shared HUD smoke covers both legends, actions, upgrades and held-input cancellation; typecheck, build and 167 targeted tests pass.
- Real iPad/Bluefy and Ride hardware remain unverified: check seated thumb reach on the dock/radial targets, action response at 1x, simultaneous touch/controller input, release/cancel, portrait rotation and the real HUD band. Sounds need an ear check.
