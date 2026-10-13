# Dynamo Defense — Codex concept art

Branch: `codex/towerdefense-concept-art`, based on `towerdefense-concept-art`.
All four required deliverables were generated using OpenAI's `image_gen.imagegen` tool.
The tool did not expose a model identifier. ImageMagick resampled the exports to the exact requested dimensions.

| File path | PNG dimensions | Generator |
| --- | --- | --- |
| `docs/towerdefense/concept/codex/td-battlefield-landscape.png` | 1600×1000 | `image_gen.imagegen` |
| `docs/towerdefense/concept/codex/td-battlefield-portrait.png` | 900×1300 | `image_gen.imagegen` |
| `docs/towerdefense/concept/codex/td-alien-roster.png` | 1600×1000 | `image_gen.imagegen` |
| `docs/towerdefense/concept/codex/td-towers-base.png` | 1600×1000 | `image_gen.imagegen` |

The optional `td-warrior-walk.png` was not produced.
Battlefield exports reserve quiet rock at the upper and lower edges for the HUD.
The roster was revised to place heads upward; the battlefield was revised for HUD clearance.
These are concept paintings: some raised tower parts retain visible side surfaces, and generated creature anatomy varies between sheets. A production pass should enforce strict orthographic geometry and exact limb counts.

## Conversion to in-game sprite sheets
Use 8 walk frames, 6 attack frames, 4 hit frames and 8 death frames per grounded alien; add 8 wingbeat frames for the glider.
Author transparent 128×128 skitter cells, 256×256 warrior cells and 512×512 boss cells, then check silhouettes at 28 px and 90 px game sizes.
Lock a single approved overhead anatomy sheet and rig per species, with fixed pivots, limb counts, palette masks and top-left lighting across frames.
Export towers, shadows, muzzle flashes, beams and cable pulses separately; render upgrades and Stalker colour variants from the same geometry.
