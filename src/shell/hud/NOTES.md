# Shared HUD

- The center panel is a single native menu button hit area, supporting touch/click and keyboard focus/activation. Controller hoods remain separate and independent.
- Game start shows a short menu-discovery toast. In the lobby the HUD opens/wakes the arcade menu; End ride remains an explicit arcade-menu action.
- Power, HR, cadence, ride time, and optional gear share one icon/number row on non-phone layouts. Units remain in tooltips and accessible labels.
- A colored heart/bolt sits beside the zone meter; amber indicates off-target effort, dim indicates missing HR.
- The target outline, dimmed outside zones, and current-position marker remain. Effort labels align under Z1.
- The zone bar and history graph share exact left/right edges.
- Cadence target range sits below measured rpm with up/down guidance; repeated units, extra tips, and difficulty are omitted.
- Duplicate gear buttons are removed. Assigned hood shifters handle touch gearing and show current gear above them; the HUD retains its optional gear reading even with legends hidden.
- Dungeon uses left gearing and right Dash/Potion; both sides shift in games using both for gears.
- Controller legends retain original --k: min(64px, 7vw, 8.6vh) dimensions.
- HudLayer measures the panel so renderer insets reserve the larger of panel or controller height plus safe-area padding.
- PR screenshots use deterministic HR/power targets, cadence guidance, gears, and 90 history bars.
- Validation: TypeScript, shell/core/inset tests, build, Chromium menu taps/keyboard/shifter isolation, reading containment, and exact meter/history alignment at five viewport sizes.
