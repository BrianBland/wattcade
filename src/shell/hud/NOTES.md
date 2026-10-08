# Shared HUD

- Wide layouts place Menu in a left rail and time/gears in a right rail beside the zone display and ride metrics.
- Tablet portrait moves controls below the metrics; history retains its own full-width row.
- The active zone source has a heart/power icon and explicit text; the matching metric is highlighted.
- The compact five-zone meter dims zones outside the target, outlines the target range, and marks current position.
- Current zone and below/in/above target status provide cues independent of color.
- Missing HR shows a waiting state without a misleading zone marker.
- History retains the full panel width, with power bars and the existing HR trace.
- Gear buttons use fixed dimensions and pulse their border without scaling outside the panel.
- HudLayer measures the center panel with ResizeObserver; --hud-h reserves the larger of panel or controller height plus safe-area padding.
- Phone layouts stack the zone and metrics; target copy wraps rather than pushing controls outside the panel.
- Combined-target fixture: at 1024×768 the panel is 620×115 px and HUD band 129 px (original 535×131 and 168 px).
- At 768×1024 the HUD band is 137 px (original 143 px). Measurements exclude safe-area padding.
- PR screenshots in docs/screenshots/hud use deterministic preview fixtures with HR/power targets, cadence guidance, gears, and 90 history bars.
- Validation: TypeScript, shell Vitest suite, production build, and Chromium containment checks at 1366×768, 1024×768, 768×1024, 390×844, and 844×390.
