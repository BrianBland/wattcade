# Shared HUD

- Controller legends retain the original --k: min(64px, 7vw, 8.6vh) dimensions; gear buttons also retain original width/height sizing.
- Wide screens place icon/number readings above a zone meter spanning the full width between Menu and gears, with clock/history below.
- Tablet portrait groups Menu, clock, and gears in a filled controls row; history spans the panel beneath it.
- Headline icons replace visible unit text; tooltips and accessible labels preserve watts, bpm, and rpm.
- Effort labels align below Z1 on the widened meter.
- A heart or solid zigzag bolt sits beside the compact zone meter; amber indicates effort outside the target, dim indicates missing HR.
- Visible metric-name, status, and current-zone captions are omitted; accessible labels preserve source, status, and target range.
- The target outline, dimmed outside zones, and position marker remain.
- Effort labels align with Z1 rather than the source icon.
- Cadence target range sits below measured rpm, with an up/down arrow when outside target; repeated units and extra tips are omitted.
- A prominent ride clock sits beside history; difficulty is omitted.
- History retains the power bars and existing HR trace.
- Gear feedback pulses a border rather than scaling outside the panel.
- HudLayer measures the panel so renderer insets reserve the larger of panel or original controller height, plus safe-area padding.
- Screenshots in docs/screenshots/hud use deterministic HR/power target fixtures with cadence guidance, gears, and 90 history bars.
- Validation: TypeScript, shell/inset Vitest suites, production build, Chromium containment checks at desktop/tablet/phone sizes.
