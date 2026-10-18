# Tower puppets — approved production rigs

Runtime index: Tesla, Prism and compact-burner Flamethrower A (owner: “I like A”).
Tesla/Prism, shared pad and reused Mortar chassis/fittings retain their source pixels.
The retired Mortar weapon rig is recoverable from main commit 44514c3.
Approved A source cutouts live in docs/towerdefense/art-briefs/flamer-rounds/flamer-production-1/source/.

Offsets, pivots, mounts and anchors use the assembled 224×224 rest frame.
The 136px pad becomes a 68px game footprint. Every part/strip frame has four clear pixels.
Include every part with minLevel <= level; upgrades remain cumulative through L5.
Every body part has a same-canvas glow; steel/brass remain non-emissive.
Flamer references unchanged pad, Mortar base and fixed L2/L4 fittings by relative path.
Its head aims about [112,112]; nozzle and cumulative tip children pulse 2.5px local +y.
Tier muzzles: L1/L2 [112,64], L3/L4 [112,51], L5 [112,44], parent nozzle.
Effect offsets select those same tiers; local [12,14] is the hot mouth in every frame.
Cable/range_center stay fixed on the pad. Tesla/Prism stay fixed while the Flamer aims.
Short pilot/attack strips use transformed approved hot-tip pixels; the game draws the cone.
Passive loops for 1600ms; attack is a 640ms one-shot, with four emissive RGBA frames each.
Existing Tesla/Prism animation timing and effect pixels are unchanged.

preview.png renders the three live manifests at L1/L3/L5 with 68px-pad reductions.
Generated aim/state proofs and GIFs go to /tmp/wattcade-td-art/flamer, outside Git.
Validation covers 1,080 aim/recoil poses, 200 animation samples, clipping, glows/strips,
fixed sockets, cumulative levels, unchanged siblings, inventory/checksums and budget.
Rebuild: python docs/towerdefense/art-briefs/flamer-rounds/flamer-production-1/build.py
Check the full live asset graph: python scripts/td-check-assets.py
The production kit remains below its original 1.5MB budget.
