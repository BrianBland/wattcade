# Overworld art

Production scenery atlases live in `remastered/`. Classic scenery is drawn by the preserved code in `src/games/warmup/render/classic/` and does not download these assets.

The transparent PNGs were generated for Wattcade using the approved concept direction. The loader in `src/games/warmup/render/remastered/art.ts` defines the nonuniform cell bounds and trims transparent padding once. Keep transparency and update those bounds when replacing an atlas.

- `remastered/scenery-atlas.png`: 24 trees, rocks, foliage clusters and buildings.
- `remastered/backdrop-atlas.png`: eight landscapes; Drive-In shares the desert panorama.
- `remastered/details-atlas.png`: cloud, windmill, sheep, beach umbrella, vintage coupe and concession stand.

Failed asset loading leaves procedural scenery available. Review captures are local output under ignored `artifacts/`, not production assets or repository history.
