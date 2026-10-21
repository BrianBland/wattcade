# Retained Tower Defense assets

The shipped kit contains only live rig images/manifests, the current terrain, six brood splat bases,
and the two machinery previews used as authoring references. `python scripts/td-check-assets.py`
checks every reference, rejects unreferenced shipped images/manifests and verifies inventories/checksums.
CI runs the same check. Pass `--update-inventories` after an intentional export or removal.

The retired Mortar's base and L2/L4 fittings remain because the Flamethrower references them.
Its unused head/barrel/upgrades/manifest and old environment prop/creep/burrow/glow overlays are removed.
A future Mortar can recover its weapon rig from main commit `44514c3`.

Approved weapon cutouts, terrain portrait-3 source/measurements and the landscape material references remain.
Rejected weapon variants, old review screenshots/GIFs, HUD sketches and generated paint guides are removed.
Weapon exporters and browser checks write review images to `/tmp/wattcade-td-art/` by default.
Regenerate paint guides/mocks with `node scripts/td-paint-guide.mjs`; their output is ignored by Git.
Objective/HUD review captures: `node scripts/towerdefense-objective-smoke.mjs`, output `/tmp/towerdefense-objective/`.

Compared with main `44514c3`, docs plus shipped TD assets occupy about 8.0 MB instead of 23.2 MB.
The PR is consolidated before publication so rejected art/review binaries are absent from its new history.
