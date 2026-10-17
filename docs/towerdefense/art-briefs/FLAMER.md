# Dynamo Defense: flamethrower tower and fireball turret head

Two red-weapon art pieces for the single-road redesign:
1. A **flamethrower tower** that replaces the Mortar tower.
2. A **fireball launcher head** for the outpost turret, replacing the current flamer head.

Both must look like they came from the same production run as the existing machinery. **Consistency with the
existing production art beats novelty.** Do not work from new concept mockups. Build from the real parts listed
below.

## Inputs (read all of these first)

| File | What it is |
|---|---|
| `public/td/towers/preview.png` | the existing tower sheet: Tesla, Mortar and Prism at L1/L3/L5, passive, glow peak and attack, plus 68 px in-game reductions. **This is the style bible.** |
| `public/td/towers/NOTES.md` | how the tower parts were made, the rig rules and the validation that was done. Follow the same rules |
| `public/td/towers/mortar/manifest.json` and `mortar/parts/` | the chassis to build on: shared pad, octagonal base, aiming head, recoiling barrel, cumulative upgrades |
| `public/td/towers/tesla/`, `public/td/towers/prism/` | the sibling towers. Read their manifests for animation and effect-strip format |
| `public/td/outpost/preview.png`, `outpost/manifest.json`, `outpost/parts/head_*.png` | the turret. `head_flamer.png` is what you replace; `head_gatling` and `head_rail` are its siblings |
| `docs/towerdefense/paint-guide/portrait-guide-mock.png` | towers and turret at true in-game size on the new map |

## 1. Flamethrower tower (`public/td/towers/flamer/`)

**Gameplay** (the art must make this readable at 68 px):
- Short range, about a third of the old Mortar's. It sprays a continuous **ground-only** fire cone at aliens
  walking past its pad. It cannot hit flyers.
- The head aims (`aim.enabled: true`, rotates about [112,112] like the Mortar). The nozzle points along the
  head's local "up" at rest.
- **The game draws the flame cone itself** with particles from the `muzzle` anchor. Do not bake long flames into
  the art. Effects stop at a nozzle flare.

**Build it from the Mortar** (this is the consistency rule):
- **Reuse unchanged:** the shared pad (`../parts/pad.png`) and the Mortar's `base.png` octagonal chassis, with their
  glows, offsets and z-order. The silhouette from directly above must match the other three towers at a glance.
- **Reuse if they read as generic hot machinery** (they already carry red indicators): `upgrade_l2` and
  `upgrade_l4`, the base-mounted upgrades. If they look mortar-specific, repaint them over the same footprint.
- **New:**
  - `head`: a squat pressurised burner housing with a fuel tank or two, hoses, and a pilot-light window.
  - `nozzle`: replaces `barrel`. A short, wide flared nozzle, not a tube. Child of the head; `recoil` may stay
    as a small 2–3 px pulse.
  - `upgrade_l3` and `upgrade_l5`: head-mounted, cumulative. Suggested: L3 a heat shield or cowl around the nozzle;
    L5 a second nozzle or a larger tank with glowing pressure gauges.
- **Paint every new part directly on top of the real base and pad** (composite them as the canvas), so lighting,
  bevel depth, rivet scale, palette and wear match. Then cut the part out. Use the existing workflow in
  `towers/NOTES.md` (keyed sheets, despill, 4 px padding, same-canvas `_glow.png`).
- **Glow and emission:** the pilot light, a hot inner nozzle ring and gauges glow orange-red. Steel and brass stay
  non-emissive. Passive animation: a breathing pilot light. Attack animation: a short nozzle flare.
  Use the same 4-frame effect-strip format and timing keys as the other towers.
- **Anchors:**
  - `muzzle` on the nozzle, at the mouth's centre
  - `cable` and `range_center` exactly as the Mortar's
  - if L5 has two nozzles, add `muzzles: [[x,y],[x,y]]` alongside `muzzle`
- Add `"flamer": "flamer/manifest.json"` to `public/td/towers/manifest.json`. **Leave the Mortar's files in place**;
  the game removes the Mortar separately.

## 2. Fireball launcher head (`public/td/outpost/parts/head_flamer*.png`)

**Gameplay:** the turret's red weapon now **lobs fireballs** in a high arc onto the road, where they leave burning
ground. It reads as a stubby launcher or lobber, distinct from the Gatling's long barrels and the Railgun's rails,
and from the new tower's nozzle.

- **Replace `head_flamer.png` and `head_flamer_glow.png` in place**, keeping the same part name, pivot ([260,260])
  and z-order, so the game picks it up with no code change. Keep the footprint within the current head's bounds,
  give or take 10 px.
- A short, wide launch tube with a breech, fuel feed hoses, and a visible glowing fireball or ember in the mouth.
  Optionally add a small child part `head_flamer_tube` with `recoil` (about 8 px along +y, like the Mortar's barrel).
- Update the `muzzle_flamer` anchor to a single `position` at the tube mouth. Remove the old twin `positions`.
- **Paint it on top of the real outpost deck** (composite deck, flywheel, cab and belt), at the same scale as
  `head_gatling` and `head_rail`, then cut it out. Match their brass, steel, rivets and bevel depth.
- Re-render `public/td/outpost/preview.png` with the new head; keep everything else byte-identical.

## Process: rounds, stop after each

Work on a branch from `td-single-lane` and open a PR into it. Put round artefacts in
`docs/towerdefense/art-briefs/flamer-rounds/<n>/`.

- **Round 1, concept on the real chassis** (no production files yet):
  - `concept-tower.png`: the flamethrower composited on the real pad and base at L1, L3 and L5, at 224 px and at
    68 px. Put it **side by side with the real Tesla, Mortar and Prism at the same levels**, in the same layout as
    `towers/preview.png`.
  - `concept-turret.png`: the outpost with Gatling, the new fireball head and Rail at 0° and ±60°, in the
    `outpost/preview.png` layout.
  - `NOTES.md`, 15 lines at most: design choices, and what you reused versus repainted.
  - **Stop and wait for the owner's feedback.**
- **Later rounds** apply feedback to the same concept. Edit, don't regenerate, unless asked. **Stop after each.**
- **Production round**, only after the owner writes "concept approved":
  - cut parts and glows, write the manifests, and add effect strips
  - render a new `towers/preview.png` with all four towers (Tesla, Mortar, Prism, Flamer) and the new
    `outpost/preview.png`
  - run the validations from `towers/NOTES.md` (aim and recoil poses, clipping, glow canvases, file-size budget)
  - update `FILES.txt`, `NOTES.md` and checksums in the asset folders you touched
  - **stop for review**

## Do not

- Change the pad, the Mortar base, the outpost deck or any other existing part's pixels, offsets or pivots,
  apart from the `head_flamer` files and `muzzle_flamer` anchor named above.
- Bake flames, smoke or fire cones longer than the nozzle flare into parts or effect strips.
- Edit anything under `src/`. If the rig format cannot express something, explain it in NOTES.md.
- Add runtime dependencies.
