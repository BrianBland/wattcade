# warmup — Warm-up Ride (lobby)

CONTRACT-REQUEST: none.

The free ride the shell runs behind its menus (`lobbyGame` in `games/registry.ts`; not in the picker,
but in `allGames` so `npm run sim:all` runs its scenarios). Never ends.

## Sim (`sim/`)
- `terrain.ts` (pure, seeded): `makeTerrain(seed, maxGrade)` -> `grade(d)` % and `elev(d)` m (analytic integral of grade,
  three interfering waves, |grade| <= maxGrade). `biomeAt(d, biomeM, start)` loops `BIOMES` with a 140 m blend.
- `sim.ts`: grade under the wheels = `hill * terrain.grade(d)`, sent as ResistanceEffect `terrain` (sim mode), virtual gears on.
  On-screen speed from `bike.raw.power` with a simple drag + rolling + slope model. Emits `biomeReached`.
- opts: `startDistance`, `startBiome`, `terrainSeed` (the shell passes them on restart so the road doesn't jump).
- Tunables (`warmup.*`): `hills` (bool; off fades the road and grade to flat over `hillFadeS`), `maxGrade`, `exaggeration`
  (screen hill height vs trainer grade), `biomeKm`, `cda`, `crr`, `hillFadeS`.
- hud(): target Z1-Z2 "Warm-up", gears, D-pad Move / A Select / B Back.

## Render (`render/`)
- Canvas 2D, low-res buffer (~230 px tall) upscaled without smoothing; text and the grade chip / road-profile panel
  drawn at full res on top. Layers: sky (+stars), celestial, clouds, backdrop (parallax .05), a ridge that is the real
  road profile zoomed out (4 m/px), mid ground + props (.5), road + ground (1, drawn with the same exaggerated elev),
  rider (tilted by the drawn slope), foreground bits (1.35), actors (birds, gulls, UFOs with tractor beams).
- `biomes.ts`: one `BiomeLook` per biome (colours, backdrop, mid/fore props, celestial). Band colours blend smoothly
  across the boundary; props switch per slot. Add a biome = add to `BIOMES`, `BIOME_NAMES` and `LOOKS`.
- `rider.ts`: procedural rider (profile jersey colour, two-bone legs from `bike.crankRevs`, bubble helmet on the Moon).

## Tests
`npx vitest run src/games/warmup` (terrain integral/bounds, biome loop, determinism, flat toggle, startDistance, scenarios).
