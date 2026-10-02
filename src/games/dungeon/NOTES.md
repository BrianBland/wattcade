# Crank Crawler (dungeon) - NOTES

CONTRACT-REQUESTs: none.

## Layout
- `sim/world.ts` per-floor maze: random spanning tree of rooms on a 5x4 grid (+~12% loop edges), varied room sizes, Z-shaped 1-tile corridors with door tiles. Deepest room (BFS) = boss room with STAIRS tile; dead-end rooms get a chest. Room count 9+floor (cap 18).
- `sim/loot.ts` weapons (7 archetypes: bolt, pellet, arrow, flame, spark/chain, orb/blast, star/bounce) x 5 elements (frost slows, fire/venom DoT, storm bonus chain, arcane crit) x 5 rarities; gear slots helm/armor/boots/ring. `score` decides upgrades.
- `sim/sim.ts` endless floors (`isOver()` is always false). `sim/types.ts` snapshot incl. fx/toasts/drops.
- `render/sprites.ts` ASCII pixel-art sprites -> cached canvases, glow cache. `render/renderer.ts` prerendered tile background per floor (4 themes), y-sorted actors, per-style projectile VFX ('lighter' compositing, no shadowBlur), effort-zone aura (Z1 none, Z2 faint blue, Z3 teal, Z4 orange + embers, Z5 strong red), fogged minimap, HUD (HP/XP/floor/coins/potions, weapon+gear card, toasts, boss bar).

## Rules
- Controls: buttons aim mode fires Y up / Z left / A right / B down (Ride diamond); dash = shiftUpR, potion = shiftDnR in every aim mode; virtual gears on the left shifters only (`useVirtualGears(true, 'L')`).
- Pickups: better `score` auto-equips, otherwise auto-sells for coins. Drops vacuum to the hero once the room is clear.
- Kills give XP; level up = +10 max HP, +4% dmg, full heal. Chests open on room clear.
- Stairs open when the floor boss dies. Descending: forge auto-spends coins (refill potions, then weapon +N, +6% each) and saves the hero (`{ bestFloor, wins, hero }`); next session resumes (`resumeRun`, not with autopilot).
- Enemies: chaser(goblin), bat, spitter(slime), archer(skeleton, telegraphed aimed shot), brute(ogre, charge), bomber(fuse+explode), summoner(raises bats). Unlock by floor; HP x enemyHpMult x enemyHpGrowth^(floor-1).
- Bosses rotate: Slime Monarch (rings), Bone Lord (spiral), Ogre Warchief (charge), The Lich (minions). Shield every 45 s for 15 s: sprint for x3, otherwise 20% leak.
- Enemies are clamped inside their room. Death -> respawn in the last cleared room at full HP.
- Auto-move (default on): explores nearest uncleared room (tile BFS), boss last, then stairs; kites at ~0.6x weapon range.

## Balance (autopilot, FTP 200)
- z2: floor 1 ~5-6 min, slowing to ~8 min by floor 10; ~10 floors/hour, level ~19, 0 deaths. Tunables: enemyHpMult, enemyHpGrowth, enemyDamageScale, bossHp, itemDropPct.

## Testing
`npx vitest run src/games/dungeon` (world connectivity, swamp grade, scenarios incl. 60-min z2-hour; ~0.5 s per sim-hour).

## Known gaps
- Renderer checked via a throwaway Playwright harness only; no sound. Manual (non-auto-move) play not balance-tested.
