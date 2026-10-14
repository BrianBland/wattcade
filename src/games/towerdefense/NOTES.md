# Dynamo Defense (towerdefense)

CONTRACT-REQUESTs: none.

## Seams
- `sim/defs.ts`: enemies, towers/levels, three curved lanes and six pads; `waves.ts`: seeded brood order, off-colour packs, forecasts, clear healing.
- `sim/boss.ts` and `sim/efforts.ts` retain #140’s HP-gated boss ladder, stagger/Exposed timing, and seeded spin/grind/hold calls. Live matchups and fuel-blooded ignition retain turret/tower attribution.
- `sim/targeting.ts`: automatic targeting, threat and decaying optional lane nudges. All shifters stay virtual gears; `aimMode` is ignored.
- `sim/construction.ts`: pure, affordable build/upgrade/repair recommendation, weighted by off-colour danger, live matchups and existing coverage; resisted choices are excluded. Upgrade orders quote the final level and total cost, including multiple levels when funded.
- `sim/types.ts`: additive snapshot fields `actions`, `refill`, `slowLane`, `suggestion`, `constructionDone`, `autoCrew`, `inputEpoch`; workshop adds `revision`. These are the sim/renderer seam for #126.
- `render/layout.ts` reserves the action dock above the actual HUD inset; `render/construction.ts` draws the dock and shared radial workshop (two-column fallback on short screens). `renderer.ts` owns pointer capture/cancel; sims import no render code.

- `render/aliens/` (#132): cut-out puppets with distance-based gaits, cached device-pixel frames, live boss poses, husks, brood splats and fire bursts; vector enemies remain the loading fallback. Assets: `public/td/aliens/`, packed by `scripts/td-pack-aliens.ts`.

## Play and controls (#119, #120, #122, #123)
- Every wave has one brood/weapon/trainer mode. Its 15 s lull announces the coming wave and ramps the trainer over the last 6 s. During that lull `brood` is the incoming wave; `nextBrood` is one wave further ahead.
- A accepts the displayed work order during a lull, otherwise opens construction. ▼ always opens the full workshop. It never auto-opens.
- Auto-crew defaults ON and accepts one order at the lull's end. Commander mode OFF requires one acceptance per lull. A successful manual build/upgrade/repair consumes that lull's crew order; an open workshop prevents automatic spending. Overrides remain available throughout combat.
- Workshop: ◀▶ pads/base, ▲▼ option, A confirm, B close (10 s idle timeout). Tap pads/base to open, then tap build/upgrade/sell/repair or the saved Auto-crew toggle. Touch and controller share selection and purchase state.
- B Overcharge: towers fire x1.5 for 10 s; 60 s base cooldown. Y Slow field: most threatened lane moves 40% slower for 8 s; 50 s base cooldown. They are optional; unusable actions consume nothing.
- Hold ▲ (or the dock’s temporary Sprint boost touch target) during a Rail boss telegraph/opening for the optional ERG push. A remains construction; menu/pause/cancel clears both gesture types.
- Z Rail: tap = one stored charge, hold 0.5 s = all. Touch and controller share a gesture; cancel/drag away/lost capture/blur/pause/menu changes discard it. Stock still requires >= 0.75 FTP (20 s nominal, max 3), independent of cooldown refill.
- Overcharge/Slow use shared `core/cooldown.ts` refill at `min(5, powerZone)` and shared fill-up buttons. A sprint edge completes those cooldowns once, without creating rail stock. Every action parameter is a `towerdefense.*` tunable. Overcharge stacks with sprint Overdrive's tower-speed multiplier.
- Combat inputs are consumed while construction is open. Stale menu revisions/epochs/quotes and same-tick touch/controller duplicates cannot buy twice. The shell sends `inputCancel` on pause to discard queued input and resume edges.
- ◀▶/paddles nudge a lane for 6 s; ▲ clears it. Turret aim and weapon choice remain automatic. Repair remains a scrap purchase; cooldown Field Repair is deferred by owner choice.

## Saves and balance
- Save v2 adds `autoCrew` independently of Garage `autoInvest`; missing fields default ON, explicit OFF survives reload. Preserve this field when #121 introduces v3. Cores/failure/Garage still use the pre-#121 rules.
- `autopilot` no longer fires combat actions or purchases every 1.5 s; `actionBot` explicitly opts into sparse actions, and `autoCrew` can be overridden in headless tests.
- Before #140 rebase: fresh profile, FTP 200, 30 min z2, seeds 1–4: passive = 27–30 cleared waves, active = 31–33; all six pads and 24 upgrades in both. Passive turret damage share 42–43% remains inside #120's 40–60% band. No tower damage/cost buffs were made.
- Previous autopilot = 32–33 waves, but included automatic Rail volleys. The new passive ride takes losses earlier; final tower progress matches, while survival is not identical. Further failure/effort/boss balancing belongs with #121/#124/#125.

## Verification and device check
- `npx tsc --noEmit -p .`; `npx vitest run src/games/towerdefense` covers action effects/refill/sprint edges, commander/crew saves, stale/double purchases, mixed input, held Rail cancellation, layout/insets and four-seed passive/active scenarios.
- `npm run dev -- --port 5199`, then `node scripts/towerdefense-render-smoke.mjs`: real browser taps, mixed upgrades, sell/repair/crew, Rail holds/cancel, landscape/portrait/phone/short screenshots in `/tmp/towerdefense-smoke`.
- Interactive harness: `/dev/towerdefense.html?inset=140&crew=0` (L=A, K=B, I=Y, J=Z, hold Arrow Up for boss boost); `manual=1` exposes `window.__td.advance(seconds)` for repeatable browser checks.
- Real iPad/Bluefy and Ride hardware remain unverified: check seated thumb reach on the dock/radial targets, action response at 1x, simultaneous touch/controller input, release/cancel, portrait rotation and the real HUD band. Sounds need an ear check.
