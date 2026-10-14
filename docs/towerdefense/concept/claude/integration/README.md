# Art integration check: PRs #135, #136, #138 plus the cut-out aliens

`dev/td-integration.html` composites the three asset PRs at true scale on a 12.9″ iPad Pro (1366×1024 CSS px at 2×, with a 120 px shell HUD band):
- terrain registered exactly as `MAP_INTEGRATION.md` specifies
- the outpost at its 11-unit footprint radius
- towers on the new plateau pads at mixed levels
- aliens on the revised lanes, sized from the sim's collision radii (body length = 2.6 × radius × the `alien` scale)

To run it, the PR assets need to be under `public/td/`. Cables are a straight placeholder.

| File | Layout | Alien scale | Warrior / Skitter / Tyrant |
|---|---|---|---|
| `A-current-sim.jpg` | current (side panels), field 736 px | ×1 | 52 / 27 / 100 px |
| `E-current-1.25.jpg` | current | ×1.25 | 65 / 34 / 125 px |
| `D-full-1.25.jpg` | full-height field (no side panels), 884 px | ×1.25 | 78 / 40 / 149 px (recommended) |
| `C-full-1.6.jpg` | full-height | ×1.6 | 99 / 51 / 191 px (too big for the trenches) |

`D-crop-device-pixels.jpg` is a crop of D at actual device pixels.
