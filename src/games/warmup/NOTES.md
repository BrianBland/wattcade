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
- Biomes (loop): countryside, seaside, underwater, jungle, desert, volcano, snow, moon. `paint.ts` = helpers + `BiomeLook`
  (colours, backdrop, mid/fore props, celestial, actor kind, particles, rider gear, outdoor, ambient bed);
  `biomes.ts` (first three + `LOOKS`), `biomesMore.ts` (the rest). Band colours blend; props switch per slot.
  Add a biome = `BIOMES` + `BIOME_NAMES` (terrain.ts) + a look in `LOOKS`.
- Actors per biome (birds, gulls, parrots, vultures, fish schools + jellyfish, lava bombs, UFOs); a biome change sends the old
  ones away. Particles are stateless (index + time): snow, ash, bubbles, fireflies, dust.
- Day/night (`daylight.ts`, tested) for outdoor biomes from the real clock: night sky, moon, stars, headlight, sunset tint.
  `?hour=21` previews a time. Ambient noise bed per biome via `setAmbient('warmup', …)`, stopped on unmount.
- `rider.ts`: procedural rider (profile jersey colour, two-bone legs from `bike.crankRevs`; bubble helmet on the Moon, scuba gear underwater).

## Tests
`npx vitest run src/games/warmup` (terrain integral/bounds, biome loop, determinism, flat toggle, startDistance, scenarios).
