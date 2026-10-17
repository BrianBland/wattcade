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
| `docs/towerdefense/paint-guide/{portrait,landscape}-guide-mock.png` | the guides with the game's real outpost, towers and aliens at true size, for scale |
| `docs/towerdefense/art-reference/environment/background.webp` | the previous painting: the **material and style reference** |
| `docs/towerdefense/art-reference/environment/preview.png` | the previous painting with the real turret, towers and aliens on it |
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
- **Clearings:** a slightly levelled, compacted patch **the size of the green circle and no bigger**: about 31 px
  radius at 1024×1536, just past a tower's footprint. Give it a defined rim that fades to rock within about 4 px,
  with no soft halo beyond. Oversized clearings leave towers sitting in rings of bare ground. Each clearing must be
  **centred on its green circle within 0.3 world units** (2 px at 1024×1536) and have a radius of 4.8 ± 0.4 units.
  The review script measures this into `<orientation>-clearings.json` and flags misses with `<- fix`.
  **No structures, foundations, hex marks or pads.**
- **Apron:** flat, uncluttered ground the size of the gold circle. **The road ends at the apron.** No trail,
  track or worn path continues past the turret, because it reads as the enemies' route going on.
- **Do not paint:** the turret, towers, aliens, cables or wires, text, numbers, UI, the dashed line, vignettes or borders.
  The game draws all of these itself. To judge the painting with them, use the review mocks (see Process), which
  composite the real sprites over your painting without changing it.
- **Edges:** every edge of the image is overflow that can appear behind interface panels on some screens. Carry
  the terrain all the way to every edge at full fidelity, with no fade, darkening frame or empty margin.
- **Overflow:** outside the dashed rectangle, keep the terrain calmer and lower in contrast than the playfield,
  with no focal points. Interface panels and controller overlays may sit on top of it, possibly translucent.

## Set pieces (portrait coordinates at 1024×1536)

- Hive mouth, near (730, 128): an organic burrow or cave mouth swallowing the road, ringed with creep.
- **The hive reaches into the playfield.** On iPads the status rows cover everything above the dashed rectangle,
  so the enemy side must read inside it. Let creep tendrils, violet staining and a few small growths come
  10–15 world units (64–96 px) into the top of the playfield, around the first crossing and the spawn run,
  fading out before the second crossing. Keep creep off the road surface and the clearings.
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
   portrait 2.5× (2560×3840), landscape 3× (4608×3072, because its box is larger), WebP quality about 85.
3. `check.png`: run `npm run dev -- --port 5203` and then `node scripts/td-paint-guide.mjs`
   (set `CHROMIUM_PATH` if Chromium is not at `/usr/bin/chromium`). The script writes
   these files in `docs/towerdefense/paint-guide/`. Copy them into the round folder:
   - `<orientation>-check.png`: the game's road edges (cyan), shoulder edges (dashed cyan), clearings (magenta),
     apron (yellow) and safe area over your painting.
   - `<orientation>-mock.png`: the game's real outpost, four towers, a mix of aliens on the road and Gliders on
     their flight lines, drawn over your painting at true size.
   - `<orientation>-mock-zoom.png`: the same at about in-game iPad resolution, cropped to the lower field.
   - `<orientation>-hud-<device>.png`: the painting and sprites in real iPad, iPad Pro and phone viewports, under
     the game's real status rows and shell HUD. A red frame means the painting runs out before the screen edge,
     which must never happen.
4. `NOTES.md`, 15 lines at most: what changed this round, where the road misses the overlay (if anywhere),
   the readability review below, and anything you are unsure about.

**Readability review** (answer in NOTES.md from the mock and HUD images, and fix problems before stopping):
- Every alien reads against the road and the rock at a glance: blue skitters and Gliders, red warriors and rams,
  purple bulwark and broodmother, and the gold Tyrant. Say which, if any, get lost.
- Towers sit naturally on their clearings, and empty clearings read as "build here" with the game's hex marker.
- The outpost sits on its apron and doesn't look pasted onto a busy texture.
- No painted feature competes with sprites for attention: bright spots, high-contrast clutter next to the road,
  or shapes that look like units.
- In the HUD images, the hive side reads on every device, and nothing important hides under the status rows or HUD.

**Portrait rounds:**
- Round 1 paints from the guide and the style references.
- Later rounds start from the previous round's painting, plus the owner's feedback quoted in the PR or task, and
  edit it rather than starting over, unless the feedback asks for a fresh take.
- Fix the overlay misses each round.
- **Stop after each portrait round** and wait for feedback. Do not start landscape until the owner writes
  "portrait approved".

**Landscape round** (after approval):
- Use `landscape-guide.png` for the layout and the approved portrait painting for materials and landmarks.
  The landscape box is larger than the portrait one (`PAINT_BOXES` in `road.ts`): wide screens show about 80 units
  of hive beyond the spawn edge, so paint a broad, dramatic hive region on the right. It is the biggest
  overflow area and the most visible.
- It is the same place seen from a different heading: every landmark (hive mouth, set pieces, salvage yard,
  distinctive rocks near the road) sits at the same world position. Rotate the approved portrait 90° clockwise
  as a positional reference; it covers less area than the landscape box, so extend outward from it.
- Relight it so the key light again comes from the **top of the new frame**. Do not just rotate the portrait
  painting; its shadows would then fall sideways.
- Same rules, check and round folder (`landscape-1/`, …). Stop for feedback after each landscape round.

## Do not

- Edit anything under `src/`, including `road.ts`. If the layout seems impossible to paint well, explain why in NOTES.md.
- Replace or delete the archived material references or other existing assets. Runtime switchover and obsolete production asset cleanup happen separately.
- Add runtime dependencies.

## Done means

- Both orientations approved by the owner. Each has a production WebP in `public/td/environment/road/`,
  a clean overlay check, review mocks with no readability problems, and its round history in
  `docs/towerdefense/paint-guide/rounds/`.
- `public/td/environment/road/NOTES.md` (40 lines at most) records the files, sizes, the registration
  (`PAINT_BOXES` and `worldToPaint` in `road.ts`), and how they were made.
