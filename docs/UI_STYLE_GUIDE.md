# Wattcade UI style guide

This is the shared contract for shell chrome and future game-owned widgets. The shell uses it now; game-owned shops, loadouts and menus are a follow-up migration. Preserve each game's art direction around these widgets.

## Source of truth and review

- `src/ui/tokens.ts`: colors, controller/effort colors, type, spacing, geometry and motion. Pure TypeScript, safe to import in renderers.
- `src/ui/tokens.css`: generated CSS variables. After changing tokens, run `node --import tsx scripts/generate-ui-tokens.ts`. The token test detects drift.
- `src/ui/components.tsx` and `widgets.css`: reusable Preact widgets. Import from `src/ui` for DOM UI.
- `src/ui/canvas.ts`: equivalent Canvas 2D drawing helpers. Import this entry directly; it has no DOM, Preact, audio, or game dependencies.
- `/dev/ui-kit.html`: interactive component gallery and matching Canvas specimens. Run Vite locally to open it. Desktop/phone captures are in `docs/visual-polish/chrome/`.
- `/dev/chrome-review.html?game=warmup&manual=1&fake=0&legend=0&view=summary`: production-screen previews. Other views: connect, riders, new-rider, edit-rider, pause, result, achievements, arcade, media, controls, loading, error, achievement.

Sunset Sprint and Coin-Op remain dev-only explorations, without a production theme picker or persistence. `variant=pocket` shows the same default styling; no query parameter is required.

The compatibility components in `shell/components/Bits.tsx` and `ui.tsx` use the new primitives and add shell sounds/navigation. Games can use the library without depending on shell services. Adjust the relative imports in the examples for your file location. Do not import UI into simulation code.

## Visual language

Pocket Arcade is the production default: warm navy surfaces, cream text, mint interaction accents, gold milestones, small pixel icons and restrained hairline separators. Primary buttons have a 3px solid key edge; progress uses 10px segments separated by 2px ticks. These treatments live in the shared DOM and Canvas adapters. Display headings use weight 900. Body copy and labels stay in readable system type; pixel art belongs in illustrations/icons. Chrome has no bloom, glass blur, decorative outlines or pill-shaped panels. Small 2px corner radii are allowed. A selected list row uses a 4px mint edge; keyboard/controller focus uses a 2px outline with a 3px offset. Keep selected, focused, pressed, disabled and busy states distinct.

| Role | Token | Use |
| --- | --- | --- |
| Background | `UI.color.background` / `--ui-color-background` | Main sheet, game-side chrome |
| Surface | `surface` | A meaningful group or transient message |
| Raised | `raised` | Pressed/selected Canvas rows |
| Text | `text` | Main labels and values |
| Secondary | `muted`, `subtle` | Descriptions and eyebrows |
| Action/focus | `accent`, `focus` | Primary action, selection and focus |
| On primary | `onAccent` | Text on mint buttons |
| Key edge | `accentEdge` | Solid primary-button depth, never a glow |
| Achievement | `gold` | Unlocks, earned XP, milestone accents |
| Error | `danger` | Failures and destructive actions |
| Separator | `line` | Quiet dividers and progress tracks |

Controller and effort colors are semantic: `UI.controller` and `UI.zone`. Keep A/B/Y/Z colors distinct, and preserve effort-zone meaning in charts. Song artwork and game accents can keep their own colors; they do not recolor system actions.

Use 4/8/12/16/24/32px spacing. Body text is normally 14px, secondary text 12px, eyebrows 10px. Titles range from 30px on phones to 48px on larger screens. Use tabular digits for readings. The live HUD uses the self-hosted Oxanium 700 numeric subset (`UI.font.numeric` / `--ui-font-numeric`, import `ui/fonts.css`); ordinary labels retain system type. Numeric rows share a size and baseline: desktop instruments, zone meter and utility icons use a 28px main row, 4px gap and 12px caption. Compact instruments stay inline; do not give read-only values a touch-button height. The bundled font license/provenance lives in `public/fonts/`. Avoid all-caps titles, wide letter spacing on body copy, and outlined/shadowed text on quiet surfaces.

## Components

| DOM | Canvas | Contract |
| --- | --- | --- |
| `UiButton` | `drawButton` | primary/quiet/danger DOM variants; focused, pressed, selected, disabled states; use one main action per decision |
| `UiPanel` | `drawPanel` | Group related content without framing every individual value |
| `UiReadout` | `drawReadout` | Label + value, with no button styling or mandatory touch height |
| `UiProgress` | `drawProgress` | Clamped 0–1 progress; mint or gold; DOM exposes accessible progress values |
| `UiTabs` | `drawTab` | Selected tabs with a quiet underline; DOM handles arrow/Home/End focus and skips disabled tabs |
| `UiListRow` | `drawListRow` | Whole-row selection/action; selected and focused are separate states |
| `UiTooltip` | `drawTooltip` | Extra help on hover/focus or deliberate tap; never hide essential instructions here |
| `UiMessage`, `UiSpinner` | compose panel + text | Empty/loading/error feedback, with a useful recovery action for errors |
| `UiField`, `UiStepper`, `UiChoice`, `UiToggle` | compose drawing helpers | Labeled, adjustable settings; DOM provides native controls and group labels |

`UiButton` accepts native button props plus `variant`, `focused`, `selected` and `busy`. Busy buttons are disabled. Native Enter/Space activation is kept out of global controller-menu handlers so it does not activate twice. Shell `Btn` preserves UI selection sounds. `UiTabs` owns local keyboard navigation; controller-driven menus still supply their selected value.

```tsx
import { UiRoot, UiPanel, UiButton, UiReadout, UiProgress } from '../ui';

<UiRoot>
  <UiPanel>
    <UiReadout label="Wave" value="04" />
    <UiProgress label="Shield recharge" value={charge} />
    <UiButton variant="primary" disabled={!canStart} onClick={start}>Start wave</UiButton>
  </UiPanel>
</UiRoot>
```

For shell screens use `chrome-ui` and the shared shell adapters. `chrome.css` owns screen composition, not a second set of widget definitions. Compatibility selectors for the reward/locker and controls guide use the same token values.

## Layout and input

- Real touch actions have at least **44×44 CSS px** hit targets. Compact readings and controller status indicators are read-only and can be smaller.
- Keep rows and lists scrollable with native gestures. Do not add separate Move/A/B controls for actions already provided by touch. Preserve controller navigation through every required action.
- Physical controller letters appear in start/pause instructions and connected-controller menu hints. Controller-less gameplay uses action names. During controller gameplay, show only cooldowns/charges/special triggers as compact indicators.
- Games provide bindings and status through `GameHud`/`ControlHint`; the shared HUD owns common controls. Do not duplicate its buttons inside game widgets.
- Use the measured renderer insets (`ctx.insets` / `setInsets`) and safe-area padding. Never hard-code a HUD height. Only use shaped occlusion data when a game explicitly supports it.
- Keep foreground content above the conservative HUD envelope, including focus outlines and tooltips. Background art may extend behind it.
- On phones, use compact tabs for large sibling panels (Browse/Queue/Preview in music) and scroll long content within the chosen panel. Keep Continue/Save/Cancel reachable. Hover history and optional help must not reserve persistent game space.
- A label must remain readable at narrow widths. Use concise labels, wrapping, or explicit ellipsis plus accessible full text. Never shrink the entire interface to fit a desktop layout.

## Canvas adoption

Draw in **logical CSS pixels**, after scaling the context for the backing-store DPR. Leave room for the primary button’s `UI.size.buttonDepth` (3px) edge on its right/bottom as well as focus outlines. Canvas helpers draw the supplied state; they do not own input, callbacks, simulation, timers, device connection or focus. Map pointer coordinates into those same logical pixels before using `hitTest`. Pass `disabled=true` to exclude unavailable actions.

```ts
import { aboveHud, drawButton, drawProgress, hitTest } from '../ui/canvas';
import { UI } from '../ui/tokens';

const safe = aboveHud(cssWidth, cssHeight, insets);
// Leave room for the outside focus outline. Recompute on resize/setInsets.
const button = { x: safe.x + 8, y: safe.y + safe.h - 52, w: 160, h: UI.size.touch };
drawButton(g, button, 'Start wave', { primary: true, focused, disabled: !canStart });
drawProgress(g, { x: button.x, y: button.y - 12, w: 160, h: UI.size.progress }, charge);
if (hitTest(button, pointerX, pointerY, !canStart)) start();
```

Three.js renderers can mount the DOM kit beside the WebGL canvas, or draw these primitives in an overlay canvas. Keep resize/inset updates and cleanup in the renderer.

Provide a matching keyboard/controller action and an accessible DOM control or equivalent accessible representation for interactive Canvas content. The Canvas specimens in the gallery are read-only images with descriptions. Keep game-specific menus behind their current implementation until their follow-up migration is reviewed. `games/kit/actionButton.ts` is the legacy glowing helper; new UI should use this library, with existing callers migrated during the game-owned-widget pass.

## Motion and feedback

Primary keys depress by their 3px edge depth on press; reduced-motion DOM styles keep their position fixed. Use 120ms for quick feedback and 200ms for ordinary transitions. No scaling on focus, looping chrome glow, or ornamental idle animation. Preserve meaningful game animation and brief earned-reward feedback. Respect reduced-motion preferences for UI transitions, count-ups and scrolling. DOM widgets disable transitions/animations automatically; Canvas callers should not add unconditional pulses.

Errors explain what failed and offer a recovery action. Loading states say what is loading. Empty states explain what to do next. Connection failures must not masquerade as successful setup; enabled configuration and a verified connection are distinct states.

## Adoption checklist

1. Use shared tokens and the matching DOM or Canvas primitive; keep game mechanics unchanged.
2. Check enabled, selected, focused, pressed, disabled, busy, cooldown and failure states.
3. Verify touch gestures, keyboard and controller navigation. Native button activation must happen once.
4. Check 320×568, 390×844, 844×390 and 1180×820, including long labels and the measured HUD inset.
5. Check reduced motion and error/empty states. Add meaningful behavioral/layout checks and capture the actual renderer.

Verification: `npm run typecheck`; `npx vitest run src/ui src/shell`; `CHROME_REVIEW_URL=http://127.0.0.1:5173 node scripts/check-chrome.mjs`; `CHROME_REVIEW_URL=http://127.0.0.1:5173 node scripts/check-ui-kit.mjs`; see the shell review README for screen captures.
