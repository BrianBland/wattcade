# Dynamo Defense: approved weapon artwork

Owner approved the Fireball launcher ("Fireball turret lgtm") and selected compact-burner Flamethrower A ("I like A").
The Flamethrower keeps a spare exposed L1, L3 shielding/supplies and L5 reinforced reservoirs/gauges.
Approved pixels are retained under `flamer-rounds/{flamer,fireball}-production-1/source/`.
Rejected concepts and generated review sheets were removed at the owner's request to avoid repository bloat.

## Production constraints

- Match the existing brass/steel machinery. Preserve the shared pad and reused Mortar chassis/L2/L4 fittings.
- Head aims about [112,112]; only nozzle/tip children pulse 2.5px along local +y.
- Tier muzzle positions: L1/L2 [112,64], L3/L4 [112,51], L5 [112,44].
- Pilot/short flare effect strips register local [12,14] to that same tier tip and inherit its motion.
- Four clear pixels pad every part and effect frame. Body/glow canvases match; brass/steel remain non-emissive.
- The runtime draws the ground-only flame cone; no long flames or smoke are baked into parts.
- The Fireball head keeps the outpost pivot [260,260] and a single mouth anchor [260,148].
- Keep source pixels, transforms, cumulative upgrades, cable anchors and unaffected siblings stable.
- No gameplay balance changes or fourth tower are included. The retired Mortar weapon rig can be recovered from
  main commit `44514c3` if a future neutral Mortar is approved; the Flamethrower's reused chassis files remain live.

## Rebuild and validate

From the repo root:

```
python -B docs/towerdefense/art-briefs/flamer-rounds/flamer-production-1/build.py
python -B docs/towerdefense/art-briefs/flamer-rounds/fireball-production-1/build.py
python scripts/td-check-assets.py
```

Production previews remain in `public/td/{towers,outpost}/preview.png` as authoring references.
Generated review sheets/GIFs go to `/tmp/wattcade-td-art/{flamer,fireball}/`; override with `TD_ART_REVIEW_OUT`.
The exporters read historical chassis/preview metadata from their pinned baseline commits and preserve the approved
source cutouts. Pose/animation validation, padding, file inventories, checksums and size budgets must pass.

With Vite running, use each round's `check-live.mjs` (`TOWERDEFENSE_BASE=http://127.0.0.1:5208`) for live muzzle,
flare/cone/projectile registration and required-art loading checks. Screenshots stay in the local review directory;
small numeric results remain beside the scripts. Inspect the generated full/gameplay-size proofs before review.
The terrain continuation uses `docs/towerdefense/paint-guide/PROMPT.md` and the current HUD layout.
