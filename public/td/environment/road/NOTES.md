# Single-road terrain paintings

- portrait.webp: 2560×3840, 1,203,140 bytes, WebP quality 85; portrait round 3, awaiting owner feedback.
- Current painting: docs/towerdefense/paint-guide/rounds/portrait-3/painting.png, 1024×1536.
- Round 3 contains a byte-identical portrait.webp and all 11 review outputs, including clearing measurements and HUD captures.
- Rounds 1 and 2 and every round's review images are archived on branch `archive/td-single-road-history`.
- Landscape has not been painted; it requires the owner's explicit "portrait approved" first.

Registration comes from src/games/towerdefense/sim/road.ts (unchanged):
- PAINT_BOXES.portrait = { x0: -40, y0: -60, x1: 120, y1: 180 } in world units (also PAINT_BOX).
- worldToPaint('portrait', p, 1536) = { x: (p.x + 40) * 6.4, y: (p.y + 60) * 6.4 }.
- Production registration uses long=3840: { x: (p.x + 40) * 16, y: (p.y + 60) * 16 }.
- The entire image is terrain overflow; the safe field is world x=0..80, y=0..112.

Round 1 used image generation from portrait-guide.png with the previous painting as the material reference.
Round 2 edited round 1's painting against the updated guide, preserving its layout and landmarks.
It extends hive creep into the upper field, tightens clearings to ~31 px and removes the trail past the apron.
Round 3 locally translated round 2's existing clearing textures/rims with ImageMagick to fix measured centring.
All pixels outside the seven edit regions, including pad 5, match round 2; no clearing is flagged by the review script.
The listed machinery previews, guide mocks and HUD sketches were inspected for scale, lighting and readability.
Camera is orthographic from above; soft light comes from the top of the portrait frame.
Upscaled with ImageMagick: convert painting.png -filter Lanczos -resize 2560x3840! -quality 85 portrait.webp.
Reviewed using npm run dev -- --port 5203 --host 127.0.0.1, then node scripts/td-paint-guide.mjs.
The check follows the fixed road/shoulders; the empty clearings/apron and all three HUD previews were reviewed.
See each round's NOTES.md for its readability review and pending owner feedback.
The previous painting and sprite preview remain unchanged in docs/towerdefense/art-reference/environment/.
Runtime uses these single-road paintings; landscape currently falls back to the turned portrait.
