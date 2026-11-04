# Hamstergrid visual and UX pass

Completed across all eight eras, keeping the existing 2D cartoon style, purple sidebar, absurd humor, Zone 2 progression and periodic bursts. Primary target: iPad landscape at 1024 × 768.

[Open the visual gallery](index.html).

## World and illustration

- Shoebox: cardboard fibers, packing tape, Gerald's employee plaque, cadence-driven Squeak-o-meter, fur strokes and wheel hardware.
- Garage: concrete texture, patched conduit, questionable management signage and clearer equipment details.
- Startup: furnished wheel desks, animated seed analyst, paperwork stamping and a three-seed financial runway.
- Utility: riveted switchboard, moving gauges, inspection walkway and dispatch desk.
- Megaproject: maintenance gantries, controls and unanswered calls from CERN.
- Planet: irregular coastlines, an orbital station and industrial shipping labels.
- Star: recognizable solar collectors mixed into the Dyson swarm.
- Galaxy: connected utility stations and the reminder that head office is still a cardboard box.
- Gerald Cam stays visible in the cosmic eras. New hires trigger brief crates in Startup/Utility/Megaproject and cargo arrivals in space. Machinery follows the wheel clock; incidental effects such as stars and blinking remain animated.
- Custom shop illustrations cover rodents, machinery, cosmic generators, supplier packaging and Vibes. Related upgrades share the parent generator's art.

## Sidebar and events

Generator rows separate names, production per unit, owned counts, prices and flavor text. Market descriptions have three lines; reincarnation has a larger card for the full reset explanation. Names and descriptions are measured before truncation. The Latest unlock shortcut navigates without purchasing; scroll thumbs show position. Selecting the first item no longer scrolls its title away on a short screen.

Gerald's Unlicensed Supply retains the Black Market tab and mechanics, with Bearing Juice, Overtime in a Bottle, suspicious sample labels and distinctive packaging. Existing IDs, prices, durations and effects are preserved.

Trial offers show configured duration and FTP target before acceptance. The explicit Accept button has a 104 × 44 px target; tapping elsewhere in the card does not accept. Event titles and instructions fit their cards. Notifications display at most two on tablet and one in narrow scenes; this is a display cap, not a notification queue.

Hamster News uses a brass-colored masthead ("FACTS OPTIONAL") and a 44 px touch strip. Headlines appear immediately, hold for 2.5 seconds, and scroll only when they overflow, at 40 px/second. The final words remain visible for at least three seconds before replacement. New bulletins wait for the current joke to finish; only the latest pending bulletin is kept. Tap the strip to pause/resume. Rotation restarts the reading window. Gameplay events still appear in their dedicated cards immediately.

## Current captures

| Era | Capture |
| --- | --- |
| Shoebox | [View](complete/shoebox.png) |
| Garage | [View](complete/garage.png) |
| Startup | [View](complete/startup.png) |
| Utility | [View](complete/utility.png) |
| Megaproject | [View](complete/megaproject.png) |
| Planet | [View](complete/planet.png) |
| Star | [View](complete/star.png) |
| Galaxy | [View](complete/galaxy.png) |

[Market](complete/market.png) · [Vibes](complete/vibes.png) · [Reincarnation](complete/rebirth.png) · [Trial on iPad](complete/trial-ipad.png) · [Trial on phone](complete/trial-phone.png) · [Market on phone](complete/market-phone.png)

[News on iPad](complete/news-ipad.png) · [Paused news](complete/news-ipad-paused.png) · [Full punchline](complete/news-ipad-end.png) · [News on phone](complete/news-phone.png) · [Phone punchline](complete/news-phone-end.png)

## Verification and limits

- `npm run typecheck`
- `npm test -- src/games/hamster` — 38 tests, including latest-unlock navigation, trial button targeting, ticker playback and pause/resume.
- `npm run build`
- With Vite on port 5212: `node scripts/review-hamster-complete.mjs` — all eight era fixtures, shop tabs, reincarnation space, trial target dimensions, first-row visibility, and ticker opening/end/pause at tablet and phone sizes; rejects browser page errors.
- `node scripts/review-hamster-machinery.mjs` — actual purchases, workforce growth, brief delivery activation and stopped wheel clock.
- `node scripts/check-hud-gestures.mjs /tmp/hamster-gestures` — scrolling, cancellation, purchase behavior, controller transitions and touch labels.

The screenshots use seeded simulations and the real renderer, with render-only trial fixtures. Progression states are staged, not a recorded playthrough. The shared HUD retains the harness bike state. Older captures remain alongside this document for design history; `complete/` contains the current gallery.

Verified in desktop Chromium, not physical iPad/Bluefy. Hardware performance and readability while riding still require that device. Semantic screen-reader controls for the canvas remain outside this visual pass. No balance or resistance rules were changed.
