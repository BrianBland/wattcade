# warmup — Warm-up Ride (lobby)

CONTRACT-REQUEST: none.

The free ride the shell runs behind its menus (`lobbyGame` in `games/registry.ts`; not in the picker,
but in `allGames` so `npm run sim:all` runs its scenarios). Never ends.

## Sim (`sim/`)
- `terrain.ts` (pure, seeded): `makeTerrain(seed, maxGrade)` -> `grade(d)` % and `elev(d)` m (analytic integral of grade,
  three interfering waves, |grade| <= maxGrade). `biomeAt(d, biomeM, start, blendM)` loops `BIOMES`; a `blendM` (tunable `warmup.blendM`, 300) window centred on each boundary dissolves `cur -> next` (`mix`), `dom` flips at the centre; `biomeWeights()` gives each biome's share.
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
  `biomes.ts` (first three + `LOOKS`), `biomesMore.ts` (the rest). Everything cross-dissolves by `biomeWeights` (colours, sky, celestials, particles, ambient bed); layers (backdrop/mid/fore) are drawn per biome into a scratch buffer and composited with `blend.ts layerAlphas`. A gateway landmark (`gateway.ts`, styled by destination biome) stands at each boundary.
  Add a biome = `BIOMES` + `BIOME_NAMES` (terrain.ts) + a look in `LOOKS`.
- Actors per biome (birds, gulls, parrots, vultures, fish schools + jellyfish, lava bombs, UFOs); a biome change sends the old
  ones away. Particles are stateless (index + time): snow, ash, bubbles, fireflies, dust.
- Day/night (`daylight.ts`, tested) for outdoor biomes from the real clock: night sky, moon, stars, headlight, sunset tint.
  `?hour=21` previews a time. Ambient noise bed per biome via `setAmbient('warmup', …)`, stopped on unmount.
- `rider.ts`: procedural rider (profile jersey colour, two-bone legs from `bike.crankRevs`; bubble helmet on the Moon, scuba gear underwater).

## Tests
`npx vitest run src/games/warmup` (terrain integral/bounds, biome loop, determinism, flat toggle, startDistance, scenarios).

## Drive-In, mesas, tumbleweeds, sounds
- Sim: `receive({ type: 'driveIn', on })`, opt `driveIn`, tunable `driveInS`; snapshot `driveIn` (0..1), `from/to/mix`, `blendM`. Renderer treats the Drive-In as one more weighted look (`render/driveIn.ts`: look, screen frame, projector beam, trailer in `rider.ts`).
  The shell calls `renderer.setScreen(rect)` (CSS px) every frame; the frame is drawn after the ridge, before the ground.
- `mesa.ts`: seeded buttes (stepped tiers, jagged cliffs, talus, strata, sun-side shading, 3 depths with haze). Pure shape tests.
- `tumbleweed.ts`: pure motion (`weedAt`: bounce parabola, spin = ground distance / radius), seeded spawn; lanes far/road/near are drawn behind / in front of the rider.
- `soundscape.ts`: pure scheduler of per-biome one-shots (recipes in `audio/sfx.ts`: FM chirps via `vib`, swells via `atk`), weighted crossfade, silent when stopped or ducked (`ambientDucked()`).
- Debug: `?biome=desert&at=0.9` starts the lobby ride in a biome (km in), `?hour=21` previews the time of day.
