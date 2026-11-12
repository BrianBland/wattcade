# Arcade UI refinements

This is the post-#203 readability and arcade-character pass. It implements the thread's final direction across the shared UI and shell, including the later End ride feedback.

- Shallow, slightly pixelated bevels on primary and secondary keys; rectangular 44px minimum touch targets and unclipped focus. The Canvas adapter uses the same colors and inset depth.
- Gold actions, selected items, tabs and progress. Mint means connected/equipped; purple is reserved for reward labels and portrait atmosphere. Orange appears in small heading/game-card details and absent peripheral indicators.
- Explicit disconnected, connecting, failed and partially connected peripheral states, with visible Connect actions and preserved retry/cancel/watch selection behavior.
- Bounded square rider portraits, aligned left/value/right selectors and units, and readable labels.
- A lightly framed game carousel with swipe/keyboard browsing, adjacent cards, a position counter and visible instructions. No separate previous/next controls; keyboard focus follows selection.
- Pause places Resume ride and End ride side by side before settings. Resume remains the default; B/Escape resumes. Game lobbies retain Exit game. Controls, history, media, results, achievements, loading/error and reward views share the same control treatment.
- Phone rewards stack vertically and controller navigation follows the layout. Physical button hints appear only when a controller is connected.

## Rendered review

[Six-page before/after PDF](ui-review.pdf)

| View | Comparison |
| --- | --- |
| Pause | [Before / after](pause-comparison.png) |
| Connections | [Before / after](connect-comparison.png) |
| Desktop riders | [Before / after](riders-comparison.png) |
| Game carousel | [Before / after](arcade-comparison.png) |
| Controls | [Before / after](controls-comparison.png) |
| Rewards | [Before / after](reward-comparison.png) |

[Gold-versus-purple selection study](../accent-revision/README.md) · [Design guide](../../UI_STYLE_GUIDE.md)

These are real browser captures of production components. Before uses main at `f078617` (including #203); after uses this branch with the same review fixtures. The older experimental working tree was unavailable after the environment reset, so this pass reconstructs the agreed direction rather than preserving every intermediate experiment. Raw screenshots are reproducible and ignored; rendered comparisons and PDFs are committed.

## Validation and reproduction

- `npm run typecheck`
- `npm test -- src/ui src/shell`: 49 files, 237 tests
- `npm run build`
- `CADENZA_TEST_URL=http://127.0.0.1:5178 node scripts/cadenza-paddles-smoke.mjs`: actual pause/settings/session integration at four screen sizes.
- Latest main’s Cadenza paddle-steering settings are preserved when opening/returning from pause; the shared value controls retain their accessible labels.
- `CHROME_REVIEW_URL=http://127.0.0.1:5178 node scripts/check-chrome.mjs`: 14 shell views at 320×568, 390×844, 844×390 and 1180×820; button height, overflow, HUD clearance, menu actions and media workflows.
- `CHROME_REVIEW_URL=http://127.0.0.1:5178 node scripts/check-ui-kit.mjs`: standalone DOM/Canvas gallery, native activation, tabs, tooltips, reduced motion and touch targets.
- `node scripts/capture-ui-refinements.mjs`: before on port 5180, after on 5178 (override with `UI_BEFORE_URL`/`UI_AFTER_URL`). Checks pause button geometry, aligned selectors, square portraits and device labels while capturing seven views at phone/desktop sizes. `UI_CAPTURE_VERSION` and `UI_CAPTURE_VIEWS` optionally narrow regeneration.
- `python scripts/package-ui-refinements.py`: package the captures using Pillow.

Device states use fixtures. Real Bluetooth hardware and iOS still need a hardware check; connection protocols, game mechanics and saved profiles are unchanged.
