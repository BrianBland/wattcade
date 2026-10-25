# Arcade chrome experiments

Three review-only variants, using the same production rider selector, ride summary and arcade menu. Layout, content, touch sizes and the higher carousel placement are shared. The existing production theme is unchanged.

The experiment changes four common treatments: token palette, display typography, primary-button edges, and selected/progress accents. This is one dev stylesheet (`dev/chrome-variants.css`) activated by a query parameter; there are no per-screen rewrites or new runtime dependencies. The approved direction would be applied to the canonical tokens and shared DOM/Canvas primitives together.

| Variant | Changes | Tradeoff |
| --- | --- | --- |
| A · Pocket Arcade | Current mint plus warm cream/gold, heavier display type, a small pixel-star accent, tactile button edge, segmented progress | Closest to the existing direction; adds personality with the smallest visual jump |
| B · Sunset Sprint | Coral primary, italic display type, small racing stripes, tinted selection and striped progress | Sportier, with a warmer palette |
| C · Coin-Op | Lemon keys on purple ink, monospace titles/numerals, harder button edges, chunky progress ticks | Most overtly retro; the boldest departure |

## Review

| Variant | Rider selector | Ride summary | Arcade selector |
| --- | --- | --- | --- |
| A | [Full capture](pocket-phone-riders.png) | [Full capture](pocket-desktop-summary.png) | [Full capture](pocket-desktop-arcade.png) |
| B | [Full capture](sprint-phone-riders.png) | [Full capture](sprint-desktop-summary.png) | [Full capture](sprint-desktop-arcade.png) |
| C | [Full capture](coinop-phone-riders.png) | [Full capture](coinop-desktop-summary.png) | [Full capture](coinop-desktop-arcade.png) |


- [Three phone rider selectors](phone-riders-comparison.png)
- [Including the current theme](phone-riders-baseline.png)
- [Three desktop ride summaries](desktop-summary-comparison.png)
- [Three desktop selectors](desktop-arcade-comparison.png)

The captures use production components over the actual renderer, with identical synthetic rider/session data and a fixed clock. The rider XP fixture is set to 62% so the progress treatments are visible. Controller/effort colors are left semantic; the variants do not add persistent HUD strips, big touch controls or decorative animations.

To reproduce, run Vite and open `/dev/chrome-review.html?game=warmup&manual=1&fake=0&legend=0&proof=1&view=riders&variant=pocket`. Use `sprint` or `coinop`, and `summary` or `arcade` for the other screens. Omitting `variant` retains the current theme. `review.html` assembles the captures; it accepts `view=summary`, `view=arcade`, `desktop` and `baseline` flags.

Validation: typecheck passes. Twelve browser checks (baseline plus three skins at 320×568, 390×844 and 1180×820) confirm no horizontal overflow, 44px buttons and working rider selection. The capture pass also exercised the summary and selector on phone and desktop without runtime errors. These are visual experiments, not a change to the approved production defaults.
