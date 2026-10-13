# Warrior parts brief (for Codex)

Branch off `towerdefense-concept-art` and put everything in `docs/towerdefense/concept/codex/warrior-parts/`. Don't change game code.

## Goal
Re-create **your Warrior** from `docs/towerdefense/concept/codex/td-alien-roster.png` as a **cut-out puppet**: separate transparent parts that the game rigs and animates in code. The legs step, and the body flexes as overlapping armour plates (like an armadillo or centipede), not one rigid body. `docs/towerdefense/concept/claude/hybrid/` shows a first spike cut by hand from your roster image: watch `warrior-hybrid.gif`. These parts replace that hand cut.

## Style (same as your roster Warrior)
- Strictly top-down orthographic, head pointing up. No visible side surfaces and no perspective.
- Black-gunmetal chitin, molten orange-red glow seams (`#ff6a2a`) and glowing eyes; spined scythe claws.
- **Light from directly above (12 o'clock), not top-left.** The left side is the right side mirrored in code, so the lighting must look correct when flipped.
- **No baked drop shadow, no background, no ground.** The game draws the shadows.
- Generate all parts together so they share one style. One practical route: lay all the parts out on a single sheet with gaps between them, on a flat `#00FF00` chroma-key background, then slice and key each part to alpha. Keep the raw sheet.

## Parts (20): right side only for paired parts
| Part | Notes |
|---|---|
| `head` | skull with horns and eyes |
| `mandible_r` | pincer; mirrored for the left |
| `thorax_1`, `thorax_2`, `thorax_3` | armour plates, each carrying one leg pair at its sides |
| `abdomen_1` … `abdomen_5` | plates tapering toward the tail |
| `tail_tip` | stinger or blade |
| `coxa_front_r`, `femur_front_r`, `claw_front_r` | front leg: socket, upper leg, scythe claw |
| `coxa_mid_r`, `femur_mid_r`, `claw_mid_r` | middle leg |
| `coxa_rear_r`, `femur_rear_r`, `claw_rear_r` | rear leg |

Assembled, the Warrior should be about **480 px long** (about 4.5× its in-game size of ~105 px).

## Joint rules (the important part)
- **Limb joints:**
  - Each child part extends under its parent by 15–20% of its own length, with a rounded "ball" end centred on the joint.
  - A ±25° rotation must show no gap and no hard edge.
  - Parts overlap in the joints and never just touch edge to edge.
- **Body plates:**
  - Each plate's front edge tucks under the previous plate's rear edge by about 25% of the plate's length, like scales.
  - A ±8° rotation between neighbouring plates must show no gap.
- **Draw order (back to front):**
  1. legs: coxa, then femur, then claw
  2. body plates, tail to head (so each front plate covers the one behind it)
  3. mandibles
  4. head

## Glow layers
For every part that has glowing seams or eyes, also deliver `<part>_glow.png`: the same canvas, with only the emissive pixels on transparent. The game uses these to pulse the glow, flash on hits and recolour variants, so the base part must still look complete without its glow layer.

## Manifest
Deliver `manifest.json`. All coordinates are in the assembled frame (pixels, origin top-left, head pointing up, body centre line at `centerX`):

```json
{
  "size": [640, 640], "centerX": 320, "lengthPx": 480, "light": "top",
  "parts": [
    { "name": "thorax_1", "file": "thorax_1.png", "offset": [x, y], "pivot": [x, y], "parent": "thorax_2", "z": 30 },
    { "name": "femur_front_r", "file": "femur_front_r.png", "offset": [x, y], "pivot": [x, y], "end": [x, y], "parent": "coxa_front_r", "z": 12 }
  ]
}
```
- `offset`: where the part's top-left sits in the assembled frame.
- `pivot`: the joint the part rotates about (where it attaches to its parent).
- `end`: the distal joint, for limbs.
- `parent`: the part it hangs from. `thorax_2` is the root; the plates chain outward from it toward the head and the tail.
- `z`: draw order.
- Mirrored left parts aren't listed; the game derives them.

## Deliverables
1. `sheet-raw.png`: the raw generated sheet(s).
2. `parts/*.png` and `parts/*_glow.png`: transparent and trimmed, with at least 4 px padding.
3. `manifest.json`.
4. `assembled.png`: composited from the parts using the manifest, left side mirrored, on transparent. Plus `assembled-ground.png`, the same on `#211d19`.
5. `joints-test.png`: four assembled poses side by side:
   - all limb joints at +20°
   - all limb joints at −20°
   - the body bent left (each plate +6°)
   - the body bent right

   Make this with a script from the manifest (for example ImageMagick or node), not by generating it again, so it actually tests the parts.
6. `NOTES.md`, which must cover:
   - the tool that generated the art
   - every file you produced
   - anything you couldn't meet, especially any joint that gaps in `joints-test.png`

   Don't describe images that don't exist.

## Checks before you finish
- `assembled-ground.png` reads as the same creature as your roster Warrior.
- `joints-test.png` shows no gaps, no hard seams and no background fringe (no green or black edge pixels).
- Shrunk to 105 px long, the Warrior still reads as a red, menacing, six-legged alien.
