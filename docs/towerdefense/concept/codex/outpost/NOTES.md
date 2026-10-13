# Dynamo outpost working files — issue 130

Art generation: OpenAI `image_gen.imagegen`; build/render: Python, Pillow, NumPy.
`generation.md` records every actual raw output, references and superseded parts.
`FILES.txt` is the complete inventory of files produced in this folder and export.

## Files and reproducibility

- `reference-towers.png`: unchanged approved original concept from
  `codex/towerdefense-concept-art`; original is absent on `towerdefense-concept-art`.
- `raw/*.png`: six complete green sheets, including two superseded source sheets.
- `build.py`, `requirements.txt`: key, despill, register axles, derive matched
  emissive layers, export assets, render all required states and validate.
- `animate.py`: render/decode looping animations, comparison, glow-off and rig proof.
- `assembled.png`, `assembled-ground.png`: final flamer assembly on transparency
  and #211d19; composed only from the exported manifest.
- `lineup.png`: the three complete exported weapon assemblies.
- `preview-full.png`: all 18 required preview states with 220px-deck reductions.
- `comparison.png`: actual original central-outpost crop beside the exported rig.
- `glow-off.png`: complete bodies with every emissive layer disabled.
- `rig-check.png`: six measured sockets, hub pivot, cab insert and aiming muzzle.
- `animations/outpost-mechanics.gif`: independent wheel spin, ±60° aim,
  Gatling axial sprite phases and sequential rail charges; 60 frames, 3 seconds.
- `animations/gatling-roll.gif`: axial roll close-up; 24 frames, 1.2 seconds.
- `validation.json`: actual checks, pose counts and production byte budget.
- `export/`: exact production folder, including its NOTES and inventory.

Rebuild and verify from this directory:

```sh
python -B build.py --output export
python -B animate.py --assets export
python -B build.py --output export --verify-only
```

## Rig details and scope

The 520px rest canvas includes transparent rotation headroom. Deck/socket extent
is 440px, twice the specified 220px game footprint. Every part has a matching
RGBA emissive canvas and at least four clear pixels around its bounds. Weapon
heads share the flywheel axle [246,230] but parent to the fixed deck, so spinning
the wheel never drags a weapon, cab or generator. The wheel is registered by its
actual axle rather than its bounding box. Belt pulleys connect the hub and
generator's lower shaft. Six cable anchors sit in the socket mouths.

The Gatling's child has six registered axial sprite phases (50ms each); aim is
inherited from `head_gatling`. Frame illustration is not exact volumetric 3D
projection, and retaining-ring surface highlights vary slightly between phases.
The weapon retains a fixed footprint, mounting axle and forward aim during roll.
Flamer has two muzzle positions and a separate matched pilot-light emission mask.
Rail has three independently selectable, cumulative glow-only child parts. The
uncharged gun remains complete without emission; purple glow is darkened in the
base, then restored only by the selected cap children. Damage decals are cumulative.

The cab cutout is a genuinely transparent window, including in the assembled
frame. `masks/cab_window.png` is a fixed destination-out stencil applied at z44
before rider/cab rendering. This prevents the spinning flywheel or deck showing
through the window, without cutting a rotating hole into the wheel itself.
The 76×47px safe rider rectangle and suggested drawRider placement are recorded
in the manifest. The preview has an empty window with a rider-sized placeholder
box, not a generated person. Optional hats/pets/trailers should be clipped to the
window by the future game renderer. No game code or runtime integration is changed.

The full-quality source previews live here; production `preview.png` is reduced
and palette-compressed to keep the entire production folder below 1.5MB. All
individual part PNGs retain RGBA detail. No deliverable is knowingly omitted;
the illustration/3D roll limitation above is recorded rather than overstated.
