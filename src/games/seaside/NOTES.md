# Seaside — runtime, voxels, workout, fishing, Lou’s shop (#184–188)

~2 h story ride (#183); storyboard + media on unmerged PR #175. `devGames` (`?dev=1` / vite dev) until Chapter 1.

## Sim (`sim/`)
- `story.ts` 33 scenes (chapter, kind, minutes, effort %FTP, trainer, ≤ 8-word monologue, look + dream).
- `types.ts` additive snapshot: base rail/story fields; #186 pull/cadenceBand/hooks; #187 fishing; #188 economy/shop.
- `graph.ts` plan / route / effort / checkpoints; `pace.ts` power⅓ × nudge (+20 % behind, −2 % ahead).
- `sim.ts` menu → story; saves at chapters / long-scene checkpoints; opts chapter/save/skipMenu. `monologue.ts` 4 s,
  hidden ≥ 105 % FTP. Events scene/chapter/save/storyEnd/trainer/pull/cast/bite/catch/escape.
- `workout.ts` one scene-mode effect/tick: ride profiles + swells, FTP-scaled fish surges by heft + bite tug, set pieces
  ramp/release, drill ERG (60–75 rpm +15 % bore), fan 80–100 rpm, paddle/wing pulses. All bike↔game values `seaside.*`.
- `pull.ts` 9 sized sprints (110–150 % FTP × 6–25 s); fish hold, tire in 110–190 s below target, escape at 240 s;
  overtime excluded from lag. Set pieces always resolve; effort sets spectacle. Z2 ~130 min vs on-cue ~120 min.
- `fishing.ts` FishingStop: spots → cast (rpm = distance) → wait (×1.5 twitch ≥ 95 rpm) → bite (A ≤ 2 s, auto 3 s
  at half value) → pull → haul/card or escape (2 tries/fish) → done (≥ 0.5× plan). `catalogue.ts`: kg, $/kg, fight.
- `economy.ts` integer cents: weight × catalogue rate × hook credit; atomic creel sale, purchases, receipt/account.
  Surf $40 / Deep $90; extras $6/$8/$4/$10. Paid extras and all old rods persist; credit forfeits extras, later sales
  repay the account first. Shop exit/timeout packs the required rod; legacy/chapter skips repair missing rods.
- Short money offers one optional, capped 180 s FishingStop per shop (`shopBonusS`); shop clock/pace lag pause.
  Catch saves checkpoint AFTER its bite; purchases/sales checkpoint immediately. Snapshot economy is a copy.
  Events purchase/bonusTurnout/bigOneReady; every scenario reaching bigOne asserts Deep. `save.ts` migrates old saves.

## World / render
- Sparse 32³ voxels, AO/greedy meshing, shader look; WorldDef data (terrain, spline, corridor, scatter, sky, rig, LOD).
- `worlds.ts`: coast + belly. Corridors keep fixed voxel size; streaming prefetches, evicts after 8 s; worker tile
  builds ≤ 6 ms/frame, atomic swaps + 0.5 s dissolve. Baked sun shadows. `world/lou.ts` reused live/stone/wheel model.
- `renderer.ts` Canvas story/fishing + shop paper; `shopView.ts` locked voxel counter/pier dioramas ported from
  reference `stills/shopStill.ts` (3 cm, 1024 shadows), rendered on entry/resize; GPU resources disposed on unmount.
  The Deep’s reel uses a painted glyph decal. `shopLayout.ts` keeps all paper/buttons above HUD; portrait framing.
- `fishingPose.ts` shared pure pose, `fishingRig.ts` voxel rod/line/bobber/fish. `worldView.ts` production ride view,
  inset-aware aim/bars, look/dream blends, perf governor (½ / ⅓ resolution), pixelLook auto/on/off.

## Verification / review (no media committed)
- `npm run typecheck`; `npm test`; `npm run build`; `npm run sim -- --game seaside --script z2 --minutes 150`.
- `CHROMIUM_PATH=/usr/bin/chromium npx tsx scripts/seaside-shop-review.ts`: four viewports, controls/purchases,
  bonus/credit/Deep checks + stills in `/tmp/seaside-shop-review`; PR workflow uploads these as an artifact.
- `/dev/seaside-play.html?scene=shop1|pierStand&speed=1&inset=140` (review fixtures: cash=150&creel=1).
- Engine benchmarks: `seaside-bench.ts`, `seaside-hitch.ts`, `seaside-pops.ts`. No engine changes for #188.
- **iPad/Bluefy hardware fps remains unmeasured** (highway ≥ 50, later scenes ≥ 40 or automatic fallback).
