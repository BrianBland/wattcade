# cosmetics

Bikes, hats, jerseys, paint, pets, trails, ships and titles: cosmetic only. Spec: SPEC §5.4b.

## Files
- `types.ts`: `SLOTS`, `Item` (slot + source + look), `RiderLook` (what drawing reads).
- `catalog.ts`: `ITEMS`. Sources: default, `level`, `achievement`, `pick` (every `PICK_EVERY` levels up to `LAST_LEVEL`). Ids are permanent.
- `unlocks.ts` (pure, reads only profile.level/achievements/cosmetics/color): `isUnlocked`, `unlockedItems`, `pickOptions`
  (after LAST_LEVEL: passed-over picks, oldest first), `pendingPicks`, `choosePick` (also equips), `equip`, `loadout` (locked → default),
  `riderLook`, `titleOf`, `newUnlocks`, `nextReward`, `unlockHint`, `withItem` (previews).
- `draw/`: `prims.ts`, `rider.ts` (`drawRider`, `lensFor` for the Drive-In beam), `bikes.ts` (`BIKES`: hip/hand/crank, leg style
  `pedal`/`run`/`dangle`, hooks `back`/`frameDraw`/`front`/`over`, `bob`/`tilt`, tandem `stoker`), `hats.ts` (`HATS`, head-local,
  radius 2.4; `FULL_HEAD` hides the face), `jersey.ts` (torso pattern in a local u/v frame, cape, leg colours),
  `pets.ts` (`FLIERS` hover at `FLY_AT`, runners at `RUN_AT`; gait from distance, sit below 0.6 m/s), `trails.ts` (stateless particles from time + index),
  `ships.ts` (`SHIPS`: Cadenza ships seen from behind; ids = the 3D hulls in `games/cadenza/render/craft.ts`, tested).
  `items.ts` draws isolated item art on the same fixed grid: hats, front-facing jersey icons, bikes, frame paint, pets and trails. The shell's
  `ItemArt` uses this art (ships keep their ship renderer); `RiderAvatar` remains the full outfit preview. Static shelf items retain lazy allocation.

`drawRider` paints through a reused fixed sprite grid (two pixels per rider unit) and composites without smoothing. This keeps world,
menu and cab rider edges consistent. The flat polygon jersey, larger cartoon head and hat scale follow the approved Club Rider art.
Keep the grid's bounds large enough for tall hats/bikes, pets, trails and the Drive-In trailer. `scripts/check-rider-style.mjs` checks real
Canvas output across the catalogue and saves a review proof; run it with Vite on port 5199. Art approvals are tracked in
`docs/visual-polish/player/README.md`.

R2 corrects road-bike proportions, shorts/sleeve lengths and solid silhouette edges. Opaque body art gets binary coverage before
compositing; glass, biome gear and translucent hats remain outside that cutout. The checker now saves the revised proof in
`docs/visual-polish/player/README.md`, where the real 60fps clip and pedal-cycle stills document motion fidelity.

C1–C3 implementation and real captures are in `docs/visual-polish/player/README.md`. Locked items remain named and visible. The Light Cycle
(`bike:tron`, Arcade Rat) no longer paints a trail. Independent `trail:lightcycle` is earned through Afterglow (ten qualifying arcade rides,
at least ten minutes of active cadence each). It uses the existing trail slot, respects No trail and works on any bike.

## Adding an item
Add it to `ITEMS` (and a drawer in `BIKES`/`HATS`/pets/trails, or a `JerseyPattern` case). Tests enforce: one item per achievement, one per
level (three per pick level), a drawer for every bike/hat, and that every item draws without throwing.
Visual check: render a gallery in the browser by importing `/src/cosmetics/draw/rider.ts` from the dev server.

## Test
`npx vitest run src/cosmetics`
