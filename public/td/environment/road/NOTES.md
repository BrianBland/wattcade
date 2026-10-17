# Single-road terrain paintings

- portrait.webp: 2560×3840, 1,203,146 bytes, WebP quality 85; portrait round 2, awaiting owner feedback.
- Current painting: docs/towerdefense/paint-guide/rounds/portrait-2/painting.png, 1024×1536.
- Round 2 also contains a byte-identical portrait.webp and all 10 review-script outputs, including three HUD captures.
- Round 1 remains archived in docs/towerdefense/paint-guide/rounds/portrait-1/.
- Landscape has not been painted; it requires the owner's explicit "portrait approved" first.

Registration comes from src/games/towerdefense/sim/road.ts (unchanged):
- PAINT_BOXES.portrait = { x0: -40, y0: -60, x1: 120, y1: 180 } in world units (also PAINT_BOX).
- worldToPaint('portrait', p, 1536) = { x: (p.x + 40) * 6.4, y: (p.y + 60) * 6.4 }.
- Production registration uses long=3840: { x: (p.x + 40) * 16, y: (p.y + 60) * 16 }.
- The entire image is terrain overflow; the safe field is world x=0..80, y=0..112.

Round 1 used image generation from portrait-guide.png with background.webp as the material reference.
Round 2 edited round 1's painting against the updated guide, preserving its layout and landmarks.
It extends hive creep into the upper field, tightens clearings to ~31 px and removes the trail past the apron.
The listed machinery previews, guide mocks and HUD sketches were inspected for scale, lighting and readability.
Camera is orthographic from above; soft light comes from the top of the portrait frame.
Upscaled with ImageMagick: convert painting.png -filter Lanczos -resize 2560x3840! -quality 85 portrait.webp.
Reviewed using npm run dev -- --port 5203 --host 127.0.0.1, then node scripts/td-paint-guide.mjs.
The check follows the fixed road/shoulders; the empty clearings/apron and all three HUD previews were reviewed.
See each round's NOTES.md for its readability review and pending owner feedback.
Existing background.webp and runtime source remain unchanged; runtime switchover is separate.
