# Dynamo Defense: single-road battlefield painting brief

You are painting the terrain background for Dynamo Defense, the tower-defense game in this repo, after its move
from three lanes to one winding road. The road and build pads are fixed game data. Your painting must match them.
The work happens in **rounds**: several portrait rounds with owner feedback, then landscape only after the owner
approves the portrait.

## Inputs (read all of these first)

| File | What it is |
|---|---|
| `docs/towerdefense/paint-guide/portrait-guide.png` | 1024×1536 flat-colour layout guide, portrait |
| `docs/towerdefense/paint-guide/landscape-guide.png` | 1536×1024 guide, the same world turned 90°: turret left, hive right |
| `public/td/environment/background.webp` | the previous painting: the **material and style reference** |
| `public/td/environment/preview.png` | the previous painting with the real turret, towers and aliens on it |
| `public/td/outpost/preview.png`, `public/td/towers/preview.png` | machinery the painting must sit under |
| `src/games/towerdefense/sim/road.ts` | the geometry the guides are drawn from (read only) |
| `docs/towerdefense/sketches/d-port.png`, `d-land.png` | gameplay sketches with the HUD, for context |

Guide colours:

| Colour | Meaning |
|---|---|
| tan band | road surface. Keep its centre line and width |
| brown edge on the tan band | low rubble shoulder, about 8 px wide at 1024×1536 |
| green circles | build clearings: flat, level, **empty** ground |
| gold circle | turret apron: flat, level, **empty** ground where the outpost machine sits |
| near-black circle | burrow mouth where the road starts, deep in the hive |
| mid grey inside the dashed rectangle | the playfield: textured rock ground, the main painting |
| darker grey either side | rock ridges and terraces (overflow) |
| violet band, then dark violet | hive territory beyond the spawn edge, getting denser and darker outward (overflow) |
| blue-grey band | our side, behind the turret: salvage yard, cable trenches, scorched ground (overflow) |
| white dashed rectangle | the safe gameplay area. Do not paint the line |

## Style

- Match the previous painting's materials: chunky dark basalt rock with crisp fractured facets, worn compacted
  brown-earth road with soft frayed edges and scattered pebbles, low rubble shoulders, rusted brass and steel
  industrial remnants half-sunk into the rock, and violet alien creep in the hive.
- Rich and dramatic, but readable under small sprites: the road surface must stay the lightest broad value in the
  playfield, so tan and orange aliens read on it. Keep large rock masses darker and lower in contrast than the road.
- **Camera:** straight down, orthographic. No perspective, no vanishing points, no visible vertical cliff faces,
  no tilt. A unit of distance must measure the same everywhere in the image.
- **Light:** a soft key light from the **top of the frame**, matching the sprites (their manifests say `light: top`).
  Shadows fall gently toward the bottom of the frame. Depth comes from cast shadows, bevel highlights on upper edges,
  ambient occlusion in creases, and dark chasms. This direction is relative to the frame, so the landscape painting
  is lit from its own top edge.
- No bright emissive spots in the playfield; glows read as weapon effects. Faint creep glow in the hive is fine.

## Hard geometry rules (checked by overlay)

At 1024×1536 the scale is 6.4 px per world unit.
- **Road:** the painted road surface must cover the tan band. Its edges may be ragged but must stay within
  ±6 px of the guide's tan edge along the whole road. The rubble shoulder stays within the brown edge, plus at most 6 px.
- **Road surface:** level and walkable along the whole length. No boulders, pipes, pits or debris on it inside the
  dashed rectangle. Small pebbles and wheel ruts are fine.
- **Clearings and apron:** flat, uncluttered ground at least the size of each circle. Paint each as a slightly
  levelled, compacted patch, so a building there looks intended. **No structures, foundations, hex marks or pads.**
- **Do not paint:** the turret, towers, aliens, cables or wires, text, numbers, UI, the dashed line, vignettes or borders.
  The game draws all of these itself.
- **Edges:** every edge of the image is overflow that can appear behind interface panels on some screens. Carry
  the terrain all the way to every edge at full fidelity, with no fade, darkening frame or empty margin.
- **Overflow:** outside the dashed rectangle, keep the terrain calmer and lower in contrast than the playfield,
  with no focal points. Interface panels and controller overlays may sit on top of it, possibly translucent.

## Set pieces (portrait coordinates at 1024×1536)

- Hive mouth, near (730, 128): an organic burrow or cave mouth swallowing the road, ringed with creep. Creep thins out
  toward the dashed rectangle, and only light creep enters the top of the playfield.
- Open ground at the bottom right of the playfield, about (600–760, 1000–1100), and left of the middle crossing:
  good places for one or two dramatic but low features (a fissure, a half-buried machine hulk, a crater),
  away from clearings and the road.
- Behind the turret (below the dashed rectangle): our salvage yard, with crates, girders, scorched plates and
  cable trenches running toward the apron. Keep it dimmer than the playfield.

## Process: rounds

Work on a branch from `td-single-lane` and open a PR into it. Each round goes in
`docs/towerdefense/paint-guide/rounds/<orientation>-<n>/` with:
1. `painting.png`: the 1024×1536 (or 1536×1024) generation, before upscaling.
2. A copy of the upscaled production file, also at `public/td/environment/road/<orientation>.webp`:
   2.5× (2560×3840 or 3840×2560), WebP quality about 85.
3. `check.png`: run `npm run dev -- --port 5203` and then `node scripts/td-paint-guide.mjs`
   (set `CHROMIUM_PATH` if Chromium is not at `/usr/bin/chromium`). The script writes
   `docs/towerdefense/paint-guide/<orientation>-check.png`, which overlays the game's road edges (cyan), shoulder
   edges (dashed cyan), clearings (magenta), apron (yellow) and safe area on your painting. Copy it into the round folder.
4. `NOTES.md`, 15 lines at most: what changed this round, where the road misses the overlay (if anywhere),
   and anything you are unsure about.

**Portrait rounds:**
- Round 1 paints from the guide and the style references.
- Later rounds start from the previous round's painting, plus the owner's feedback quoted in the PR or task, and
  edit it rather than starting over, unless the feedback asks for a fresh take.
- Fix the overlay misses each round.
- **Stop after each portrait round** and wait for feedback. Do not start landscape until the owner writes
  "portrait approved".

**Landscape round** (after approval):
- Use `landscape-guide.png` for the layout and the approved portrait painting for materials and landmarks.
- It is the same place seen from a different heading: every landmark (hive mouth, set pieces, salvage yard,
  distinctive rocks near the road) sits at the same world position. Rotate the approved portrait 90° clockwise
  as a positional reference.
- Relight it so the key light again comes from the **top of the new frame**. Do not just rotate the portrait
  painting; its shadows would then fall sideways.
- Same rules, check and round folder (`landscape-1/`, …). Stop for feedback after each landscape round.

## Do not

- Edit anything under `src/`, including `road.ts`. If the layout seems impossible to paint well, explain why in NOTES.md.
- Replace or delete `public/td/environment/background.webp` or other existing assets. The game switches over separately.
- Add runtime dependencies.

## Done means

- Both orientations approved by the owner. Each has a production WebP in `public/td/environment/road/`,
  a clean overlay check, and its round history in `docs/towerdefense/paint-guide/rounds/`.
- `public/td/environment/road/NOTES.md` (40 lines at most) records the files, sizes, the registration
  (`PAINT_BOX` and `worldToPaint` in `road.ts`), and how they were made.
