# games/kit — shared canvas helpers for game renderers

CONTRACT-REQUESTs: none (no `src/contracts.ts` change; plain functions and local types).

- `actionButton.ts`: `drawActionButton(g, spec)` — a fill-up cooldown button (fills bottom-to-top while refilling, tinted by effort via `effortTint(zone)` + `effortFlourish(zone)`; greyed until ready; glows/pulses when ready; outlined label/glyph readable at any fill). Pure helpers `fillEdgeY`, `desaturate`. Canvas 2D only: never import DOM, Preact, three or game code here; sims must not import kit (renderer-only).
- Pair with `core/cooldown.ts` (pure, sim-safe): `refillRate(powerZone)`, `tickCooldown`, `completeCooldown` (sprint), `readyFrac`.
- First user: dungeon (#86). Candidates: Starfighter missiles/nova, Tower Defense railgun charges, Watershed tools.
