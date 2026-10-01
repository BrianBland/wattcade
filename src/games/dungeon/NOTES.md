# Crank Crawler (dungeon) - NOTES

CONTRACT-REQUESTs: none.

## Layout
- `index.ts` exports `module` (GameModule); `loadRenderer` dynamically imports `render/renderer.ts` (`createRenderer()`).
- `sim/world.ts` seeded 8-room dungeon (self-avoiding walk on a 3x3 grid, chain of rooms, boss last), tiles floor/wall/swamp/door.
- `sim/sim.ts` `createDungeonSim(ctx, { autopilot? })`; `sim/types.ts` snapshot type (`DungeonSnapshot`, includes `hooks`).
- `scenarios.ts` sprints-boss (20 min), idle (5 min), z2-progress (20 min); all use `simOpts: { autopilot: true }`.
- `test/stub.ts` local stub GameContext (delete once runHeadless is wired); `test/dungeon.test.ts`.

## Behaviour notes
- Rooms 1-6 have enemies, room 0 is the safe start, room 7 the boss. Doors of a room lock when the player is 0.75 tile inside and enemies live.
- Death: respawn in previous room at full HP with 2 s invulnerability; the room's enemies keep their HP.
- Boss shield: first at t=45 s after bossStart, then every 45 s for 20 s; unshielded boss takes normal damage.
- Resistance effects (sim mode, virtual gears on): terrain, swamp, wounded, boss-surge; only set/cleared on change.
- Buttons aim mode: Y/A/Z/B fire up/down/left/right (combos = diagonals); dash = shiftUpR, potion = shiftDnR (spec's "z = dash" conflicts with Z firing left).
- Aim: paddles active -> manual (rotate/axes); auto-aim when paddleIdleS > autoAimIdleS (1.5) or aimMode auto.
- Persists `{ bestTimeS, wins }` via ctx.save on boss kill.
- Balance (stub, autopilot, FTP 200): z2 beats boss in ~9-10 sim-min with 1-2 deaths; sprints ~7-8 min; idle 0 rooms. enemyDamageScale default is 0.5.

## Testing
`npx vitest run src/games/dungeon` (runs scenario asserts through the stub, 36000 steps in ~50 ms).

## Known gaps
- Renderer untested in a browser (typecheck only); no sound; no minimap.
- Autopilot is crude (kite/strafe + bullet avoidance), only for tests.
