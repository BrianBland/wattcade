# Tower puppets — issue 129

Art regenerated with OpenAI image_gen.imagegen on three revision-2 #00FF00 sheets.
Pillow/NumPy slice, key, despill, resize, extract emission and render the PNG parts.
Reference: td-towers-base.png on codex/towerdefense-concept-art (the file is absent
from towerdefense-concept-art). Working files are based on towerdefense-concept-art.

FILES.txt enumerates every production file, including this note and the inventory.
manifest.json indexes tesla/manifest.json, mortar/manifest.json and prism/manifest.json.
Each tower manifest follows the alien offset/pivot/parent/z convention and references
one shared octagonal pad, with a cable socket at the right rim.
Levels 1–5 include all parts with minLevel <= level. Head rotation is clockwise,
zero points up. Coordinates are absolute in the 160x160 assembled rest frame.
Inherit parent transforms before applying local rotations around pivot.
Mortar barrel is a child of head; recoil translates it 8px along its local +y axis.
The muzzle anchor follows the barrel; cable and range_center follow the static pad.
L2 and L4 attach to base; L3 attaches to head. L5 Prism power coils attach to base;
Tesla electrodes and Mortar heat exchangers attach to head.
Every base PNG has a same-size _glow.png, including clear layers for unlit parts.
Use additive RGB weighted by alpha for emission; base art is complete alone.
All cutouts have at least 4px transparent padding. Pad diameter 136px is 2x 68px.

preview.png is rendered from these manifests and PNGs on #211d19 ground:
L1/L3/L5 at 0/45/180 degrees for all towers, plus nine Mortar recoil poses.
Each cell also includes the same assembly reduced to a 68px pad footprint.
The full directory is below 1.5MB. No game code changed.

Working branch: codex/td-towers-work, docs/towerdefense/concept/codex/towers/.
Rebuild with python build.py --output PATH after installing requirements.txt there.
Validation checks all five levels and full rotations (480 poses including recoil).
Revision 2 restores the original tall copper solenoid and sphere, open iron Mortar
barrel, prominent faceted crystal and densely bolted-on machinery. The view follows
the concept's steep overhead angle and visible depth, per the user's art direction;
it is not strict orthographic. Rig rotation remains a 2D cutout transform.
