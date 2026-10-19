# Compact H1 live HUD

The shared HUD now uses linear controls grouped by function and hand. Directions are together on the left, face actions on the right. The default face order is A/B/Y/Z; Cadenza explicitly orders its opposing lane controls Z Left / A Right. Per-game shifter actions and analog paddle hints keep separate groups. Steering-only games advertise left/right in play and retain full navigation in menus. Inactive controls retain their positions, full labels and cooldowns.

History and the physical controller guide open above the ribbon without increasing its reserved height. Controller users can open history through Pause → History. The guide shows physical letters and all current mappings. Fake-bike keyboard instructions live in Pause and the guide; they never occupy the HUD band. Menu has its own hit target.

![Live implementation](game.png)

## All eight games

### Warm-up Ride

![Warm-up Ride control strip](warmup.png)

### Dynamo Defense

![Dynamo Defense control strip](towerdefense.png)

### Crank Crawler

![Crank Crawler control strip](dungeon.png)

### Cadenza

![Cadenza control strip](cadenza.png)

### Watershed

![Watershed control strip](watershed.png)

### Sprocket Squadron

![Sprocket Squadron control strip](starfighter.png)

### HAMSTERGRID

![HAMSTERGRID control strip](hamster.png)

### Keeper’s Light

![Keeper’s Light control strip](lighthouse.png)

## Touch and help

![Touch layout](touch.png)
![Physical map and help](guide.png)

Full action copy can grow the measured ribbon instead of being clipped. [Long-price phone capture](long-price-phone.png) · [Cadenza on short landscape](cadenza-short.png). Native height adapts to labels, viewport, safe areas and touch targets; the earlier 88px mock was a study envelope. Ordinary 1180×820 desktop captures here are about 93–94px. Core readings, zone targets, current marker, cadence guidance and gear/command state remain visible.

## Validation and reproduction

- Typecheck and production build pass.
- 45 focused tests pass, including all-game menu/play mapping preservation, independent History/Menu, physical-map letters, fake-help placement, whole-band insets, controller access to pause history, and pointer cancellation.
- The all-game Chromium matrix covers tablet 1180×820, short landscape 844×390 and phone 390×844, with no page errors, mixed arrow/face families, clipped labels or offscreen controls. Narrow layouts were rechecked after the phone footer refinement.
- TD browser checks pass both layouts at four sizes, touch/keyboard workshop input, current construction quotes, rail tap/hold/drag and layout-switch cancellation, and touch/Up-arrow boss boost/release/construction cancellation. The old test fixture assumed obsolete square field geometry, an earlier boss window, and an affordable upgrade; those checks now use the current field rectangle, a Rail boss seed/window, and the quoted affordability.
- Fake-help visibility leaves measured height unchanged. A 9,999-scrap phone action label stays within its button.

Run Vite on port 5211, then `node scripts/check-compact-hud.mjs` (or set `REVIEW_URL`). Captures default to `/tmp/wattcade-compact-hud`; `HUD_GAMES`/`HUD_SIZES` can focus a subset. `TOWERDEFENSE_BASE=http://127.0.0.1:5211 node scripts/towerdefense-hud-smoke.mjs` runs held-input checks. `/dev/hud-live.html?game=cadenza` opens a real HUD/renderer review; `legend=0` selects touch, `menu=1` checks menu mappings, and `manual=1` freezes simulation. See [gallery](index.html).

Native iPad/Bluefy frame pacing and a physical Ride-controller pass remain device validation. This branch targets main independently of the reward/locker UI PR.
