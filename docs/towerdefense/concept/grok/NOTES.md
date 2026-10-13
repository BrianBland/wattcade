# Grok set: Dynamo Defense concept art

## Files
- `td-battlefield-landscape.png` (1600×1000)
- `td-battlefield-portrait.png` (900×1300)
- `td-alien-roster.png` (1600×1000)
- `td-towers-base.png` (1600×1000)
- `td-warrior-walk.png`: **not produced.**

## Tools
All art comes from Grok Bot image generation (GenerateImage). Resizing, cropping and the roster labels were done with Python/Pillow. Nothing was hand-painted.

## Known misses
- The generator returned 1280×720 for every request, so every image is upscaled and cropped.
- The camera is mostly top-down but leans toward a 3/4 view, especially on towers and the outpost. The brief asks for strict orthographic.
- **Portrait:** I tried twice to get a true portrait composition and both came back landscape. The file is a centre crop of a landscape render, so the tesla coil, prism lens and gliders fall outside the frame.
- **Landscape:** the HUD bands aren't fully clear. Creep reaches the top band and the outpost sits in the bottom band.
- **Roster:** the left-edge Skitter and Bulwark are slightly clipped by the crop. The labels were added afterwards in Pillow.
- **Towers:** the sheet shows a level 1 and an upgraded variant of each tower, but they aren't labelled as level 1 and level 5. The outpost turret has a pilot flame rather than a full flamethrower jet.
- **Walk cycle:** skipped. A generated 8-frame strip wouldn't stay consistent across frames.

## Toward sprite sheets
- Generate each alien on its own at 4× its in-game size, then downscale to the in-game sizes (skitter 28 px, warrior 90 px) and add a 2 px dark outline in post.
- Use 8-frame walk cycles and 4-frame attack/death cycles. Keep one canonical reference image per alien and feed it as the reference to every frame, so all frames stay on-model.
- Split the colour seams and glow into a separate layer. Then the Stalker's colour shift and the hit flashes can be tinted in-engine instead of being redrawn.
- Pack each brood into one atlas with fixed cell sizes.
