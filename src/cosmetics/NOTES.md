# cosmetics

Shared cosmetic wardrobe; ships are selected inside Cadenza. Spec: SPEC §5.4b.

## Catalog and ownership
- `types.ts`: shared `SLOTS`, `SLOT_GROUPS`, Item/WearLook, top cuts, resolved RiderLook.
- `catalog.ts`: active `ITEMS`, `ARCHIVED_ITEMS`, `ALL_ITEMS`, stable slot/id lookup, defaults.
- `legacyCatalog.ts`: immutable original catalog and old reward sources; keep its IDs and art.
- `rotation.ts`: old slot/id → replacement Item. One shared cosmetic per achievement;
  levels 2–50 give one reward, except every fifth level offers three different slots.
- Exactly one active title per game (including Warm-up), three cross-game titles, no level titles.
- `migrate.ts`: freeze old ownership once into cosmetics.legacy, remap chosen picks without rerolling;
  `rotation` marks current profiles. New profiles cannot earn archived assets. Existing owners retain them.
  ProfileStore persists the snapshot on read and preserves it in JSON backups.
- `unlocks.ts`: pure unlock/equip/pick rules, active/legacy ownership, previews, look resolution.
  Locked or unknown loadout IDs fall back to starters. New wardrobe slots equip independently.
  Original whole-kit pants/capes remain on legacy tops until another bottom/back item overrides them.
- Cadenza hulls are excluded from active ITEMS; `games/cadenza/ships.ts` owns local availability.

## Art
- `draw/rider.ts`: shared two-sample sprite grid and solid cutout; opaque rider edges stay binary.
- `draw/outfit.ts`: parameterized bottoms, hands, feet, eyewear and back art anchored to live joints;
  isolated shelf drawings reuse the worn drawers. Includes the tutu and opaque skin-tone censor mosaic.
- `draw/jersey.ts`: jersey, tank, crop, bikini, hoodie, vest, mesh, knotted, coat, jacket and robe cuts.
- `draw/items.ts`: isolated art. `RiderAvatar` shows the full outfit; lazy shelf allocation remains.
- Drawers for all original bikes/hats/pets/trails remain for Legacy owners. Light Cycle/trail stay independent.
- `/dev/wardrobe-catalog.html`: live active collection, vanilla/mixed/small-scale views and motion.
  `/dev/wardrobe-review.html`: the original fifteen-item art study.

## Validation
`npm run typecheck`; `npx vitest run src/cosmetics src/progression src/shell src/games/cadenza`.
With localhost Vite on 5199: `node scripts/check-wardrobe.mjs` checks visible worn/shelf art,
all bikes at four crank phases, owned Legacy browsing, tutu equip, phone overflow and local ships.
`node scripts/check-rider-style.mjs /tmp/wattcade-player` checks existing rider art and caller state.
Captures: `docs/visual-polish/wardrobe/implemented/`; proposal and source map in the parent directory.
