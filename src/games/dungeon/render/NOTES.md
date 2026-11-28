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
  (+ Grim Sweeper exported, unused; `bosses2.py` repaints all 7), Gear Masher `boss2.free` + `flailgear` (chain drawn at runtime by `drawFlail32`), shots, coins, items, shrines, sigils, puffs, per-stance DNF.
- `light32.ts` (pure): ambient per zone + lights falling off (1-d/r)², vertical distance ×1.25, stepped by 0.17 with Bayer
  dither on 2×2 blocks. Walls occlude via grid line of sight; a wall face is lit only by a light at or below its row that
  sees its foot; wall tops get a 30% spill. Buffer holds L/2 and is applied multiply + one additive pass (up to 2×).
- `shade` works per light over its bounding box (cost ∝ lit area). Static LOS cached; ≤24 nearest statics + all dynamic.
- Emissive layer after lighting: flames, crystal glow, relics, shots, muzzle flashes, pixel damage numbers, stance swap, pool
  light streaks, open-stairs motes. Fog over unseen rooms on top. Death plays a DNF beat before the camp guardroom.
- HUD: bevelled `pixelPanel` frames, inventory row of sockets with real 32 px item/weapon art + rarity gems (gear wraps above on narrow screens), shadowed text, heavy display face (`displayText`) for titles/banners/boss names, framed boss bar, whole-pixel minimap; hit flash per real hit.
- Old 16 px paths (`sprites.ts`, `art.ts`, `weapons.ts` masks) remain as the fallback until the sheets decode.
- Budget: 1024×768 DPR 2 headless Chromium: median 16.7 ms on floors 1/2/4, p95 ≤ 21 ms. Floor textures tile seamlessly.
- Room dressing (`world32.ts` `dress`): corner clusters, back-wall furniture, side-wall clutter, a centrepiece per room
  (Keep rosette or carpet, Crypt ledger stones, Catacombs bone mosaic, Deep rune seal or lava fissures) ringed by lit props,
  weighted floor clutter; never within 2 tiles of doors/stairs or on chests/shrines. Lit props and glowing decals add lights.
- `fx32.ts`: Crypt fog, grit (lit); Deep embers, refracting crystals, crystal floor slabs (`crystalMask`), clipped to open tiles.
  Pools: depth-dithered body (`POOL_RAMP`), stone lip, ripples, drip rings; Keep/Crypt mirror actors and lights.

## Layout and input (unchanged)
- World camera and simulation remain continuous; drawing snaps to native pixels. Area-based zoom balances portrait/landscape.
- Display canvas keeps readable HUD/damage text and the shell's bottom-inset layout.
- `pixel.ts`: geometry, nearest-neighbour mask rotation, viewport sizing, paddle/pinch zoom with hysteresis and limits.
- Camera focus eases toward the hero/boss midpoint; only new floors reset it.
- `font.ts`: original 5×7 alphabet; pixel chrome uses stepped frames and segmented meters.
- Weapon classes: Wand, Scattergun, Bow, Blaster, Boltcaster, Orb, Shuriken, Dagger, Axe, Spear; 3 tiers, 6 elements, 6 rarities.
- Archetype & Skill Tree UI (`skillArt.ts`, `campUi.ts`, `skillTreeUi.ts`): 45 bespoke 12×12 pixel-art skill icons, 9 branch crests, 3 Boss Trophy Relics, and 6 UI badges rasterised once with dark outline + cleared on `unmount()`; Camp Hero Archetype Showcase with live animated Hero Portraits (`drawHero32`), Branch Crests, inline ERG/Grade toggle, workout histograms, and End-of-Run Build Trophy (`campLayout`, tested); Dual-Mode Quick-Pick Strip & Full 3-Branch 27-SP Diablo Skill Tree (3-pip T1/T2, 2-pip Forks, Paragon counter, portrait medallion fallback with zero pip overlap, lit/unlit pipes, two-step Fork confirmation); combat build VFX (smooth monotonically spinning Chainring Sawblades, Blazing Halo, Turbine Shock, Over-Shield shimmer, Photo Finish trails, Caldera/Mountain King auras).
- Studio AV, Juice, Boxless HUD & Battlefield Spectacle (`audioBus.ts`, `music.ts`, `musicScore.ts`, `sound.ts`, `juice.ts`, `playerHud.ts`, `minimap.ts`, `biomeBanner.ts`, `combatFx.ts`, `wyrm32.ts`): studio WebAudio DSP rack (Karplus-Strong physical-model plucks, trainer-room 4-band mastering EQ, dual room/hall reverbs, tube-amp overdrive, glue compressor, limiter, Skill-Tree low-pass tone filter) driving 32-bar (128-beat) 9-cue adaptive soundtracks (dedicated biome Ambush overdrive, Headwind Wyrm & Grim Sweeper boss themes, biome-specific solos, diatonic harmonies, Archetype accents, beat-quantized transitions, combat stingers) and layered Foley SFX (all disposed on `unmount()`); comfort-capped quadratic camera trauma, enemy hit recoil, sparks/confetti, pulsing low-HP danger rim, and active status/buff pills (`SLIMED`, `HEADWIND`, `CRIPPLED`, `DIG IN!`); boxless top-left Player HUD + sleek bottom-left Weapon/Gear dock (no manual pace buttons); boxless top-right minimap with silhouette halo; Biome Arrival Title Cards; boss ground telegraphs + 14-segment articulated Snake **Headwind Wyrm** (`wyrm32.ts`); organic world-space curved volcanic basalt lava pools (`world32.ts` `drawLava`); diegetic hero status VFX (slime drips, gale wind streaks, crimson drag shackles); non-blocking Loot Choice card below the minimap.

## Checks
- Review: `/dev/dungeon.html` (Live game; `floor=N` jumps to a floor, `manual=1` for captures).
- `node scripts/dungeon-render-smoke.mjs` while Vite runs on 5173; captures go to `/tmp/dungeon-smoke/`.
- typecheck, dungeon + inset tests (light32: occlusion, shading; dress32: dressing). Physical iPad not covered.
