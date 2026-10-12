# Overworld rendering

## Visual styles

`classic/` holds the preserved simple biome and Drive-In drawings. `remastered/` holds the detailed scene loader, procedural fallback and material scenery. Production atlases are in `public/overworld/remastered/`. Shared simulation, daylight, blending, gateway, soundscape and tumbleweed logic remains outside those style directories.

The profile's art choice reaches the rider and all cosmetic previews through the shared rider dispatcher. Stored preference values remain compatible with earlier profiles; UI names are Classic and Remastered. Changing style remounts the renderer without restarting the ride. Classic never requests Remastered assets and is unaffected when another rider has loaded them.

## Motion and performance

Remastered uses two raster pixels per logical unit, fractional prop placement and filtered upscaling. Cached sprites have transparent gutters to avoid edge clipping during subpixel movement. The panorama cache stores mirrored pairs as one continuously translated repeat texture. Road samples use half-unit spacing and unrounded heights. Classic keeps its original whole-unit sampling and pixel snapping.

Three scenery planes dissolve as a whole with cropped intermediate surfaces. Resized props have a 256-entry LRU cache; panoramas have a 32-entry bound. Ground grain uses one seeded tile per scene. The terrain simulation, rider footprint and trainer grades are unchanged; distant panoramas are decorative. Failed atlas loading keeps procedural scenery usable.

The shell interpolates only displayed snapshots between 30 Hz simulation ticks. Trainer resistance and recording use the original snapshot. Terrain-profile samples and grades are cached for 100 ms and invalidated on hill/terrain changes or movement over 10 m. Target-device frame pacing still needs profiling on iPad.

## Verification

`/dev/biomes.html?art=classic` or `?art=remastered` previews all biomes and Drive-In. `?hour=15`/`?hour=21` sets the clock, and `?manual=1` renders on demand. The studio writes no saved profiles.

With Vite running, `node scripts/check-biome-render.mjs [base-url]` checks both styles, crossfade opacity, drawing-state restoration, deterministic props, asset-failure fallback, style switching and fractional scenery motion. `node scripts/capture-biomes.mjs classic [base-url]` / `remastered` captures day/night scenes. All images and validation/timing output go to ignored `artifacts/`; they are not committed source or history.
