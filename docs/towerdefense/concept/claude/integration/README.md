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

## Visibility variants (`visibility-variants.jpg`)
Pixel mock-ups of Codex's painted map (`&floor=dark`, `&rock=calm` on the integration page), full-height field, aliens ×1.25:
- **V1 as is:** the mid-brown floors give dark-shelled aliens strong silhouettes. Busy plateau rubble hides fliers and competes with the towers.
- **V2 dark floor:** worse. Dark chitin merges into the floor and only the glows survive.
- **V3 calm rock:** best. The floors keep their contrast and the plateaus stop competing.
- **V4 both:** muddy everywhere.

## Blue brood readability (`blue-readability.jpg`, `dev/td-aids.html`)
Skitters and Gliders on a real path floor (top) and a plateau (bottom) of the painted map, at iPad Pro game scale. As is, they read as dark scribbles on both, because their shells are near-black with thin cyan lines. A 35% brood-colour shell tint plus a soft 1 px brood-colour outline fixes it without hiding detail; a 1.3× Skitter adds mass. The strong 1.5 px outline turns them into flat stickers.

## Floor value with re-toned blues (`floor-variants.jpg`)
Tan, mid (about 30% darker) and dark (about 55% darker) path floors. The blue brood has a simulated lighter re-tone (`bluetint=0.5`); the bottom row adds a soft 1 px brood-colour outline to every alien (`rim=0.45`). Without the outline, the reds go murky on darker floors. With it, every brood reads on every floor. Mid keeps the moody look and still separates the paths from the charcoal plateaus.

## Re-toned blue brood (Oct 13)
- `retoned-blues-on-map.jpg`: Codex's re-toned Skitter and Glider puppets on the tan floor, the mid floor, and the mid floor with a soft outline, with no tint. Both now read without aids.
- `roster-with-retoned-blues.jpg`: all eight animated.
- `blue-candidates-vs-puppets.jpg`: left to right, the compact Skitter candidate (unrigged), the re-toned Skitter puppet, the Glider candidate (unrigged), and the re-toned Glider puppet.
