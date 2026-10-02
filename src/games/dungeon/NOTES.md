# Crank Crawler (dungeon) - NOTES

CONTRACT-REQUESTs: none.

## Layout
- `index.ts` exports `module` (GameModule); `loadRenderer` dynamically imports `render/renderer.ts` (`createRenderer()`).
- `sim/world.ts` seeded 13-room dungeon, 19x13-tile rooms (self-avoiding walk on a 4x4 grid, chain of rooms, boss last), tiles floor/wall/swamp/door.
- `sim/sim.ts` `createDungeonSim(ctx, { autopilot? })`; `sim/types.ts` snapshot type (`DungeonSnapshot`, includes `hooks`).
- `scenarios.ts` sprints-boss (20 min), idle (5 min), z2-progress (20 min); all use `simOpts: { autopilot: true }`.
- `test/dungeon.test.ts` runs scenarios via core `runHeadless` and checks swamp grade via `createGameSession` + mixer.

## Behaviour notes
- Rooms 1-11 have enemies, room 0 is the safe start, room 12 the boss. Doors of a room lock when the player is 0.75 tile inside and enemies live.
- Death: respawn in previous room at full HP with 2 s invulnerability; the room's enemies keep their HP.
- Boss shield: first at t=45 s after bossStart, then every 45 s for 20 s; unshielded boss takes normal damage.
- Resistance effects (sim mode, virtual gears on): terrain, swamp, wounded, boss-surge; only set/cleared on change.
- Buttons aim mode: Y/B/Z/A fire up/down/left/right like the Ride diamond (combos = diagonals).
- Dash = shiftUpR, potion = shiftDnR in every aim mode; virtual gears use the left shifters only (`useVirtualGears(true, 'L')`).
- Aim: paddles active -> manual (rotate/axes); auto-aim when paddleIdleS > autoAimIdleS (1.5) or aimMode auto.
- Persists `{ bestTimeS, wins }` via ctx.save on boss kill.
- Balance (stub, autopilot, FTP 200): enemyDamageScale default 0.5.

- Auto-move (tunable `autoMove`, default on): the autopilot movement logic (path through doors, kite/strafe, bullet dodge) steers unless a D-pad direction is held. Player still aims (paddles/auto-aim), dashes (R shift up), potions (R shift down).
- `hud()`: controls legend, gears:true, targetZone Z2 'Heal' (Z4-5 'Sprint! Shield up' while boss shield is up). Renderer HUD is top-only (HP, potions, dash, boss bar, minimap top-right); camera ~16 tiles across.
- Enemy HP: chaser 45 (red), spitter 70, brute 160 (dark red); boss 3500.
- Balance now (autopilot): z2 clears boss in ~9.5 sim-min, 0 deaths; sprints ~8 min.

## Testing
`npx vitest run src/games/dungeon` (scenarios via runHeadless)..

## Known gaps
- Renderer untested in a browser (typecheck only); no sound; no minimap.
- Autopilot is crude (kite/strafe + bullet avoidance), only for tests.
