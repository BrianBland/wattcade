# Remaining roster puppets

The seven sets preserve the original generated roster artwork and use anatomy-specific joints. The existing Warrior is included unchanged on `overview.png` for comparison. No game code changed.
Art source: OpenAI `image_gen.imagegen`; model identifier not exposed. Original roster commit: `0f5539c`. Python/Pillow/NumPy/SciPy produce the source crops, transparent cutouts, glow masks, manifests and scripted tests.
136 source parts and matching glow layers; 2304 joint-contact checks pass with no flagged gaps, clipping or green fringe.
Use `python -B build_all.py` then `python -B document.py` here to reproduce all seven. A species name can restrict the build. Each set also has build.py/render.py wrappers and a NOTES.md listing every actual output.
Original baked highlights remain slightly oblique. Glider wing membranes preserve source holes; Stalker glow masks are white and only glow is tinted; tails are 8/8/10 links; Broodmother sac and Tyrant crest/three-section scythe arms are independently articulated.

| Creature | Parts | Tail links | Folder |
| --- | ---: | ---: | --- |
| skitter | 25 | 8 | `../skitter-parts/` |
| glider | 13 | 5 | `../glider-parts/` |
| ram | 15 | 0 | `../ram-parts/` |
| bulwark | 15 | 0 | `../bulwark-parts/` |
| broodmother | 16 | 0 | `../broodmother-parts/` |
| stalker | 23 | 8 | `../stalker-parts/` |
| hive-tyrant | 29 | 10 | `../hive-tyrant-parts/` |

Shared files produced: `anatomy.py`, `build_all.py`, `rig.py`, `document.py`, `roster-source.png`, `overview.png`, `summary.json`, `NOTES.md`.
