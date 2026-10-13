# Outpost image generation provenance — issue 130

Generating tool for all six raw sheets: OpenAI `image_gen.imagegen`.
Keying, desaturation of green edge spill, cutout registration, emission masks,
PNG crops, and all preview compositions: Python/Pillow/NumPy in `build.py`.
No preview was separately generated. The reference is copied without changes
from `codex/towerdefense-concept-art`,
`docs/towerdefense/concept/codex/td-towers-base.png`.
The final issue 129 tower work was consulted via `codex/td-towers-work`, including
its NOTES, generation history, accepted lineup and center-registration code.

## Retained original generated sheets

- `raw/deck-flywheel-sheet-raw.png` — output
  `exec-7283bba4-ecc7-45b6-8987-ce3c4f650456.png`. Referenced original concept.
  Requested two isolated overhead parts on flat #00FF00: octagonal riveted
  gunmetal deck with six sockets and hazard ring; brass eight-spoke flywheel
  with open keyed spaces. No attached cab, generator or weapons. Both exported.
- `raw/machinery-sheet-raw.png` — output
  `exec-1e35ccf9-662f-47e0-b50d-d3773c660007.png`. Referenced concept and deck sheet.
  Requested separate empty cab frame, detailed copper generator and two-pulley
  toothed belt drive. Generator and belt exported; this tall cab is superseded.
- `raw/weapons-sheet-raw.png` — output
  `exec-9fad5196-e562-4208-a370-2b5bb83988af.png`. Referenced concept and deck sheet.
  Requested isolated Gatling breech, twin-nozzle flamer with pilot light, railgun
  with three charge seats, barrel bundle, small capacitor inserts and two damage
  decals. Three heads and decals exported. Rail emission is extracted from its
  own three seats for exact alignment; separate lower-row inserts are unused.
  Original standalone barrel is superseded by the registered animation phases.
- `raw/gatling-spin-sheet-raw.png` — output
  `exec-8d69a112-aac3-401b-bc39-b191bc10cc4d.png`. Referenced weapon sheet.
  Requested six axial roll phases on green, fixed aim and retaining collars.
  This first version did not sufficiently change muzzle layout; not exported.
- `raw/gatling-spin-v2-sheet-raw.png` — output
  `exec-6de23ede-4113-4ccc-b522-83f41a0f0de0.png`. Edited the preceding sheet with
  explicit five-bore rotor progression. All six phases exported on a shared
  canvas, registered by coupling axle. These are illustrated axial roll phases,
  not a mathematically projected 3D mesh; no planar rotation substitutes for roll.
- `raw/cab-v2-sheet-raw.png` — output
  `exec-60944102-38c6-4dbd-99f1-e5888f5d0534.png`. Referenced concept and machinery.
  Requested an almost-square riveted cab with a wider-than-tall empty green
  window to accommodate the existing side-on bicycle rider. This cab is exported.

All raw outputs retain their original dimensions, metadata and green matte.
The concept's surface vocabulary is preserved: aged brass bevels, dense rivets,
dark steel, copper windings, hazard markings, scratches, rust and soot. The frame
is overhead and orthographic; bevels and nozzle mouths retain the approved
concept's visible machinery depth. No generated ground shadow is retained.
