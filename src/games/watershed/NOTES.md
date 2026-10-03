# watershed (ERG river game)
CONTRACT-REQUEST: none.

## Shape
- `sim/terrain.ts`: 96×144 valley heightfield (x across, y downstream, sea level 0), erodibility map, two rock ridges, spring basin.
- `sim/water.ts` `Water`: particle water + erosion, pure and deterministic (rng injected). Particles splat into a depth grid,
  then flow down the free-surface gradient (`max(h,SEA) + pressure·w`; a particle exerts no net force on itself). Per-parcel
  size factors (drag/deposit/dig) are cached at spawn, so changing `dragExp`/`depositExp`/`massExp` affects new parcels only.
  `settle()` relaxes generated terrain (thermal to convergence) and resets `h0`.
- `sim/salmon.ts` `SalmonRun`: path traced from the depth grid (`updatePath`, once a second), lane steering, bears/eagles,
  falls (surface rise over 2 rows) needing `leapRpm`. Pure; `DEFAULT_SALMON` params (not yet ctx.tuning tunables).
- `sim/plan.ts`: the fixed 45 min ERG plan (15 blocks, incl. the 6 min salmon run), `planAt(t, scale)`, `bandMid` (for the `cadence-follow` script hook).
- `sim/sim.ts`: ERG effect `flow` (ftpFraction from the plan), cadence → parcel volume/speed/spread, steering, stats once per
  second, `rideDone` + save `{rides, bestCarved, bestDelta}`. Snapshot shares the live typed arrays (no copies).
- `render/`: Three.js diorama (`renderer.ts`: terrain/river/drops/camera/cues/sound), `scenery.ts` (sky, Forest, Clouds,
  SeaSurface), `creatures.ts` (school, bears, eagles, danger markers), DOM HUD + popups (`hud.ts`), pure `layout.ts`.
- Snapshot `cues` (last 24, increasing ids) drive sounds/popups; the renderer skips history on mount.
- Requires ERG: `requires: { erg: true }` (arcade gate in `src/shell/services.ts#missingRequirement`).

## Tuning (`watershed.*`)
Flow/cadence mapping: flowPerFtp, volHeavy/volLight, rpmLow/rpmHigh, speedLow/speedHigh, bandBonus.
Water/erosion: gravity, pressure, friction, shallowDrag, capacity, erode, deposit, massExp, talus. Plan: planScale.

## Numbers (seed 2, 15 min, testProfile FTP 200)
grind: deepestCut ~13, toSea 0 · spin: deepestCut ~11, toSea ~140. Full 45 min cadence-follow: carved ~14k, delta ~10k.
Sim cost ~0.35 ms/step at ~1000 parcels (desktop node).

## Tools
- `npm run snap:watershed -- --script spin --minutes 15 --every 5 [--autopilot]` → PNGs in `out/watershed/`.
- `/dev/watershed.html?script=grind&min=10&autopilot=1&inset=120` (vite dev) renders without the shell.

## Gaps / next
- FTMS `capabilities.erg` is currently always true (Feature 0x2ACC isn't read), so the ERG gate only bites once it is.
- Salmon params aren't tunables yet; terrain colours/trees update every sim tick (fine on desktop; profile on iPad).
- Not built: water wheels, evaporation/cloud/rain phases, generated story levels (see SPEC §6.4 "Later").
