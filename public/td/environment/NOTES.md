# Dynamo Defense environment

The single-road renderer uses `road/portrait.webp` and, when available,
`road/landscape.webp`, registered by `PAINT_BOXES` in `sim/road.ts`.
See `road/NOTES.md` for painting sources, measurements and review history.
The previous three-lane painting and machinery preview are preserved as unchanged
style references in `docs/towerdefense/art-reference/environment/`.
Its production background registration and three-lane layout data are removed.

The reusable overlay kit remains byte-identical: 27 pieces with matching glows,
absolute 512×512-frame offsets/pivots in `manifest.json`, and `overlays-preview.png`.
The alien renderer still loads `parts/splat_1.png` through `parts/splat_6.png`.
Organic pieces support brood-tinted emission; splats support base and glow tint.
All other retained materials remain available for future environment work.

`FILES.txt` lists the complete recursive production inventory.
`SHA256SUMS.txt` hashes every listed file except itself, including this note.
Painting review inputs and historical rounds live outside public assets.
