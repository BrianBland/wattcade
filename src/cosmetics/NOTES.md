# cosmetics

Shared cosmetic wardrobe; ships are selected inside Cadenza. Spec: SPEC §5.4b.

## Catalog and ownership
- `types.ts`: shared `SLOTS`, `SLOT_GROUPS`, Item/WearLook, top cuts, resolved RiderLook.
- `catalog.ts`: current `ITEMS`, current-only slot/id lookup, defaults; retired entries cannot equip.
- `legacyCatalog.ts`: frozen input catalog and old reward sources for the rotation and pick-ID translation.
- `rotation.ts`: old slot/id → replacement Item. One shared cosmetic per achievement;
  levels 2–50 give one reward, except every fifth level offers three different slots.
- Exactly one active title per game (including Warm-up), three cross-game titles, no level titles.
- `migrate.ts`: remap old chosen picks without rerolling, remove retired equipment and old ownership
  snapshots. All profiles use current level/achievement/pick requirements; rotation 2 cleans earlier saves.
  ProfileStore persists migration on read; import/export also uses only current ownership rules.
- `unlocks.ts`: pure current unlock/equip/pick rules, previews and look resolution.
  Locked or unknown loadout IDs fall back to starters. New wardrobe slots equip independently.
- Cadenza hulls are excluded from active ITEMS; `games/cadenza/ships.ts` owns local availability.

## Art
- `draw/rider.ts`: shared two-sample sprite grid and solid cutout; opaque rider edges stay binary.
- `draw/outfit.ts`: parameterized bottoms, hands, feet, eyewear and back art anchored to live joints;
  isolated shelf drawings reuse the worn drawers. Includes the tutu and featureless bare censor body.
- `draw/censor.ts`: post-composite pixelation samples body, bike and scene; follows zoom, tilt and clips.
- `draw/jersey.ts`: jersey, tank, crop, bikini, hoodie, vest, mesh, knotted, coat, jacket and robe cuts.
- `draw/items.ts`: isolated art. `RiderAvatar` shows the full outfit; lazy shelf allocation remains.
- Source art remains for historical render studies. Light Cycle/trail stay independent.
- `/dev/wardrobe-catalog.html`: live active collection, vanilla/mixed/small-scale views and motion.
  `/dev/wardrobe-review.html`: the original fifteen-item art study.

## Validation
`npm run typecheck`; `npx vitest run src/cosmetics src/progression src/shell src/games/cadenza`.
With localhost Vite on 5199: `node scripts/check-wardrobe.mjs` checks visible worn/shelf art,
all bikes at four crank phases, retired-item exclusion, tutu equip, phone overflow and local ships.
`node scripts/check-censor.mjs` checks scene sampling, camera transforms, clips, alpha and all bike poses.
`node scripts/check-rider-style.mjs /tmp/wattcade-player` checks existing rider art and caller state.
Captures: `docs/visual-polish/wardrobe/implemented/`; proposal and source map in the parent directory.
