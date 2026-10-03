# watershed (ERG river game)
CONTRACT-REQUEST: none.

## Shape
- `sim/terrain.ts`: 96×144 valley heightfield (x across, y downstream, sea level 0), erodibility map, two rock ridges, spring basin.
- `sim/water.ts` `Water`: particle water + erosion, pure and deterministic (rng injected). Particles splat into a depth grid,
  then flow down the free-surface gradient (`max(h,SEA) + pressure·w`; a particle exerts no net force on itself). Per-parcel
  size factors (drag/deposit/dig) are cached at spawn, so changing `dragExp`/`depositExp`/`massExp` affects new parcels only.
  `settle()` relaxes generated terrain (thermal to convergence) and resets `h0`.
- `sim/plan.ts`: the fixed 45 min ERG plan (18 blocks), `planAt(t, scale)`, `bandMid` (for the `cadence-follow` script hook).
- `sim/sim.ts`: ERG effect `flow` (ftpFraction from the plan), cadence → parcel volume/speed/spread, steering, stats once per
  second, `rideDone` + save `{rides, bestCarved, bestDelta}`. Snapshot shares the live typed arrays (no copies).
- `render/`: Three.js diorama (`renderer.ts`), DOM HUD (`hud.ts`), pure `layout.ts` (tested against insets).

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
- No trainer-capability fallback yet: on a trainer without ERG the plan still sends ERG (real FTMS KICKR supports it).
- No sound. No interpolation between sim ticks (drops step at 30 Hz).
- Not built: water wheels, salmon, cycle phases, generated levels (see SPEC §6.4 "Later").
