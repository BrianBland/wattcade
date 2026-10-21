# Dynamo outpost assets

The original kit was generated with image_gen from the approved tower material references.
Round-1 fireball head approved by owner on 2026-10-17 ("Fireball turret lgtm").
The new `head_flamer` production part is a lossless crop of the approved generated concept;
its same-canvas emission mask contains only the ember/nozzle interior. Steel/brass do not glow.
All other parts, their offsets/pivots and image pixels are unchanged.
Source, rebuild script, 0°/±60° emission proofs and 480-pose validation:
`docs/towerdefense/art-briefs/flamer-rounds/fireball-production-1/`.

`FILES.txt` lists all production files; `SHA256SUMS.txt` hashes every other file.
`manifest.json` retains 14 parts, the fixed 520×520 frame, parent/z order and weapon selection.
Every weapon pivots about [260,260]; zero aims up, positive angles turn clockwise.
The 440px deck is shown at 220px in the production preview (2× game art).
`head_flamer` is the Fireball launcher; its single `muzzle_flamer` is [260,148].
The naming remains compatible with the runtime weapon group and existing saves.
The launcher crop has four clear pixels of padding; its pivot and z-order are unchanged.
All other muzzle/cable/range anchors retain their original positions.

Heads parent to the fixed deck, independently of the crank-driven flywheel.
The Gatling child rolls through six illustrated axial phases (50ms each), not in-plane aim.
Each phase and body part has a same-canvas glow; rail caps are intentionally glow-only.
Draw cap N when charge >= N; damage stages are cumulative.
The fixed cab window uses `masks/cab_window.png` at z44 before cab z45.
Clip the runtime rider to [300,321,76,47], ground [338,366], scale 1.7.
The window mask and cab never inherit flywheel rotation.

`preview.png` retains all 18 production states. Only its three Fireball cells were rebuilt;
all other decoded preview pixels are identical to the preceding preview.
All base art remains complete with emission disabled; light comes from the frame's top.
No ground, shadows or long flames are baked into the parts.
The complete production kit remains below 1.5 MB.
