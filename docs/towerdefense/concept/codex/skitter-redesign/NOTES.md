# Compact blue Skitter candidate

Generated anew with OpenAI `image_gen.imagegen` (model ID not exposed), with `../puppet-tools/roster-source.png` as the actual visual reference. Broad original electric-blue back plates, dark metallic chitin and narrow silver accents match the alien roster and new Glider direction.
Visual anatomy review: eight legs in four pairs, with thick blue upper surfaces and hooked claws; broad low carapace, clustered blue eyes and a shorter chunky bladed tail. Clear negative spaces between legs retain the compact swarm silhouette.
This is a transparent **unsegmented design candidate**: emission is baked into the single image, with no separate glow layers, manifest, pivots or articulated animation yet. Existing Skitter/Glider puppets and game code are unchanged.
ImageMagick normalizes the raw generated image into a padded640×640 candidate and builds the plain-ground preview. `roster-style-check.png` puts the reference sheet beside the new candidate.
Browser check: 16 creatures per swarm, nominal head-to-tail lengths28/35/45px, Chromium deviceScaleFactor=2, the game's `/td/environment/background.webp`, tan-floor and dark-rock rows. No tint, rim, outline or underglow aids; zero page/load errors. Bounds and sizes are recorded in `preview-validation.json`.
At all three sizes the broader blue body and legs remain distinguishable from the map. At28px most silver/plate detail merges, but the creature retains blue mass. This screenshot is a still; the preview's `window.__draw(t)` translates whole sprites, without a jointed gait. No puppet joint checks apply to this unrigged candidate.
Reproduce: run `npm run dev -- --port 5173`, then `node docs/towerdefense/concept/codex/skitter-redesign/capture-swarm.mjs`; requires installed playwright-core and `/usr/bin/chromium`.

Files actually produced:
- `source-raw.png` — transparent generated source with the roster sheet as input.
- `candidate.png` — normalized640×640 transparent candidate.
- `candidate-ground.png` — candidate on#211d19 for inspection.
- `roster-style-check.png` — original roster beside the new compact Skitter.
- `capture-swarm.mjs` — reproducible browser swarm comparison script.
- `swarm-map-2x.png` —16-creature swarms at28/35/45px on both map surfaces.
- `preview-validation.json` — bounds, size, surface, scale, candidate status and browser errors.
- `NOTES.md` — this report.
