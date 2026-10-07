# cosmetics

Bikes, hats, jerseys, paint and titles: cosmetic only. Spec: SPEC §5.4b.

## Files
- `types.ts`: `SLOTS`, `Item` (slot + source + look), `RiderLook` (what drawing reads).
- `catalog.ts`: `ITEMS`. Sources: default, `level`, `achievement`, `pick` (every `PICK_EVERY` levels up to `LAST_LEVEL`). Ids are permanent.
- `unlocks.ts` (pure, reads only profile.level/achievements/cosmetics/color): `isUnlocked`, `unlockedItems`, `pickOptions`
  (after LAST_LEVEL: passed-over picks, oldest first), `pendingPicks`, `choosePick` (also equips), `equip`, `loadout` (locked → default),
  `riderLook`, `titleOf`, `newUnlocks`, `nextReward`, `unlockHint`, `withItem` (previews).
- `draw/`: `prims.ts`, `rider.ts` (`drawRider`, `lensFor` for the Drive-In beam), `bikes.ts` (`BIKES`: hip/hand/crank, leg style
  `pedal`/`run`/`dangle`, hooks `back`/`frameDraw`/`front`/`over`, `bob`/`tilt`, tandem `stoker`), `hats.ts` (`HATS`, head-local,
  radius 2.4; `FULL_HEAD` hides the face), `jersey.ts` (torso pattern in a local u/v frame, cape, leg colours).

## Adding an item
Add it to `ITEMS` (and a drawer in `BIKES`/`HATS`, or a `JerseyPattern` case). Tests enforce: one item per achievement, one per
level (three per pick level), a drawer for every bike/hat, and that every item draws without throwing.
Visual check: render a gallery in the browser by importing `/src/cosmetics/draw/rider.ts` from the dev server.

## Test
`npx vitest run src/cosmetics`
