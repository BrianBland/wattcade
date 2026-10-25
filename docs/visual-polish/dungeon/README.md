# Crank Crawler pixel art pass

The preview and capture script show implemented game artwork. Generated images stay outside the repository in `/tmp/dungeon-smoke/`.

- `armory.png`: the ten weapon families in all six modifier palettes (runed tier shown).
- `bosses.png`: all six bosses, idle and wind-up, drawn at the same native pixel size.
- `gameplay.png`: a real Slime Monarch warning window, with pixel projectiles, target markers, terrain and torch flames.

Preview with `npm run dev`, then open `/dev/dungeon.html`. The Armory tier selector shows the three silhouettes per family. The Terrain tab compares four dungeon palettes; Effects previews four animation phases.
Normal weapons use steel/silver with no elemental on-hit effect. Other modifiers color the weapon inlay, projectile and hit effect; rarity colors its fittings. Uniques and shrine upgrades add runes.

Daggers join Skirmisher loot, axes join Vanguard loot, and spears join Ranger loot. Each new type has distinct speed,
range, rate and piercing stats. Alternatives share existing family drop weights so the wider pool does not increase drop frequency.

Run `node scripts/dungeon-render-smoke.mjs` against the local Vite server to generate these images and check console errors,
HUD inset clearance, portrait/landscape/DPR2 resizing, boss warning artwork and renderer cleanup. All screenshots,
animation frames and the generated GIF go to `/tmp/dungeon-smoke/`.

The former Flamecaster and Storm Rod families are now Blaster and Boltcaster. All shuriken tiers use pointed blades with a solid hub.
`terrain.png` shows the flatter, softly worn flagstones and connected marsh shores. `effects.png` and `projectiles.gif` show the projectile animation.
HUD frames, meters and all in-game text use pixel styling. The original bitmap font includes lowercase letters,
tabular numbers, punctuation and HUD symbols. Whole-pixel scaling keeps edges crisp; long labels ellipsize instead of compressing.
Compact camp rows put descriptions on a second line; HUD text sizing stays consistent across display densities.
The default zoom uses viewport area to keep actors a similar size in portrait and landscape. Room boundaries and boss
encounters never override it. Either paddle zooms in with positive deflection and out with negative deflection; each deflection changes one step.
On touch screens, spread two fingers to zoom in or pinch them together to zoom out. The controls legend lists both methods.
Zoom is renderer-only and leaves gameplay unchanged.
`typography.png` shows the shared lettering at title, item, combat and compact HUD sizes. `camp.png` shows it in the upgrade menu.

Class labels use short names: Wand, Scattergun, Bow, Blaster, Boltcaster, Orb, Shuriken, Dagger, Axe, Spear.
Item variants follow the same rule (e.g. Dagger / Kunai / Dirk); modifiers remain separate.
