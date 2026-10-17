# Single-road terrain paintings

- portrait.webp: 2560×3840, 1,423,508 bytes, WebP quality 85; portrait round 1, awaiting owner feedback.
- Original generation: docs/towerdefense/paint-guide/rounds/portrait-1/painting.png, 1024×1536.
- The round also contains a byte-identical portrait.webp, geometry overlay and two real-sprite review mocks.
- Landscape has not been painted; it requires the owner's explicit "portrait approved" first.

Registration comes from src/games/towerdefense/sim/road.ts (unchanged):
- PAINT_BOX = { x0: -40, y0: -60, x1: 120, y1: 180 } in world units.
- worldToPaint('portrait', p, 1536) = { x: (p.x + 40) * 6.4, y: (p.y + 60) * 6.4 }.
- Production registration uses long=3840: { x: (p.x + 40) * 16, y: (p.y + 60) * 16 }.
- The entire image is terrain overflow; the safe field is world x=0..80, y=0..112.

Made with image generation, painting directly from portrait-guide.png with background.webp as the material reference.
The listed machinery previews, guide mocks and HUD sketches were inspected for scale, lighting and readability.
Camera is orthographic from above; soft light comes from the top of the portrait frame.
Upscaled with ImageMagick: convert painting.png -filter Lanczos -resize 2560x3840! -quality 85 portrait.webp.
Reviewed using npm run dev -- --port 5203 --host 127.0.0.1, then node scripts/td-paint-guide.mjs.
The check follows the fixed road/shoulders and preserves empty clearings/apron; see the round's NOTES.md.
Existing background.webp and runtime source remain unchanged; runtime switchover is separate.
