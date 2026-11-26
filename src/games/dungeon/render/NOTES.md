# Purgatour render

## 32 px art (current)
- All art is hand-authored in `tools/purgatour-art/*.py` (32-colour master palette in `pal.py`, outlined characters).
- `python3 tools/purgatour-art/export.py` (Pillow) writes `art32/`: `zone-{keep,crypt,catacombs,deep}.png`, `chars.png`,
  `arsenal.png`, `atlas.json`. The game never generates art; it crops, flips, rotates (32 steps) and hit-flashes.
- `world.theme` 0..3 → Keep / Crypt / Catacombs / Deep; zones swap 12 stone colours plus their own walls, doors, props, light.
- `art32/index.ts`: atlas loading (`loadArt`, `artReady`), `cut`, `charFrame`, `anim` (anchors ax/ay), `rotated`, `mirrored`, `flashOf`.
- `world32.ts`: background chunks (floor composition, damp band, 48 px wall faces rising 16 px, capstone tops only beside rooms,
  void elsewhere, trims, torches, hangings, baked decor), animated lava, pool glints. `floorInfo` places torches/pillars/decor.
- `actors32.ts`: hero (5 stance outfits × front/side/back × 4-frame walk, weapon gripped at the hand and rotated to the aim),
  enemies (Coneling, Saddle Sore, Gel Slime hop, Lost Rider, CO2 Gremlin, Wrench Troll, Directeur Sportif), 6 bosses
  (+ Grim Sweeper exported, unused), shots, coins, items (bidon, helmet, jersey, shoe, ring), shrines, curse sigils, puffs.
- `light32.ts` (pure): ambient per zone + lights falling off (1-d/r)², vertical distance ×1.25, stepped by 0.17 with Bayer
  dither on 2×2 blocks. Walls occlude via grid line of sight; a wall face is lit only by a light at or below its row that
  sees its foot; wall tops get a 30% spill. Buffer holds L/2 and is applied multiply + one additive pass (up to 2×).
- Static light LOS is cached per light; dynamic lights are the hero, up to 10 friendly shots and muzzle/boom flashes.
- Emissive layer after lighting: flames, crystal glow, shrine relics, shots, puffs. Fog over unseen rooms on top.
- `TILE_PX` is 32, so the viewport scale halves and the same number of tiles stay on screen (tests use device pixels).
- Old 16 px paths (`sprites.ts`, `art.ts`, `weapons.ts` masks) remain as the fallback until the sheets decode.
- Budget: 1024×768 at DPR 2 holds 60 fps in headless Chromium on floors 1 and 4 (median 16.7 ms frame, p95 ≤ 19 ms).
- Not yet ported from the mocks: water reflections, crystal refraction, Crypt fog and falling grit.

## Layout and input (unchanged)
- World camera and simulation remain continuous; drawing snaps to native pixels. Area-based zoom balances portrait/landscape.
- Display canvas keeps readable HUD/damage text and the shell's bottom-inset layout.
- `pixel.ts`: geometry, nearest-neighbour mask rotation, viewport sizing, paddle/pinch zoom with hysteresis and limits.
- Camera focus eases toward the hero/boss midpoint; only new floors reset it.
- `font.ts`: original 5×7 alphabet; pixel chrome uses stepped frames and segmented meters.
- Weapon classes: Wand, Scattergun, Bow, Blaster, Boltcaster, Orb, Shuriken, Dagger, Axe, Spear; 3 tiers, 6 elements, 6 rarities.

## Checks
- Review: `/dev/dungeon.html` (Live game; `floor=N` jumps to a floor, `manual=1` for captures).
- `node scripts/dungeon-render-smoke.mjs` while Vite runs on 5173; captures go to `/tmp/dungeon-smoke/`.
- typecheck, dungeon + inset tests (`light32.test.ts` covers occlusion, faces and shading).
- Physical iPad/Bluefy is not covered by the browser checks.
