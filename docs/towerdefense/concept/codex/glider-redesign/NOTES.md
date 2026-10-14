# Fresh Glider candidate

Generated from scratch with OpenAI `image_gen.imagegen` (model ID not exposed): dark biomechanical body, matched skull horns, broad saturated electric-blue membranes, three bone fingers per wing, blue veins and bladed tail. The existing rig did not constrain this design.
This is a transparent, **unsegmented design candidate**, not a replacement puppet: glow is baked into the single image, and no manifest, pivots or animation are supplied. Existing Glider puppet and Skitter art are retained. No game code changed.
ImageMagick normalizes the generated square image into a padded 640×640 candidate and supplies the plain-ground preview.
Comparison uses the game's actual `/td/environment/background.webp`, existing `dev/td-rig.ts` for the current puppet, Chromium deviceScaleFactor=2 and nominal head-to-tail lengths of 45px and 140px. Candidate scale comes from its actual opaque bounds; no tint, outline or underglow aid. Two rows sample tan floor and dark rock. No page/load errors.
The new wing panels are cleaner and continuous. Their blue stands apart from both surfaces; the body and tail remain dark at 45px. Compared with the puppet, this candidate has a longer-looking tail and fewer bright vein accents. Its static pose also differs from the animated puppet's 0.3s pose; the screenshot compares designs, not identical animation frames.
Current puppet polish is recorded in `../glider-parts/NOTES.md`: corrected metallic membrane patches, a matching horn pair and 168 passing joint checks. Those checks do not apply to this unrigged candidate.
Reproduce preview: `npm run dev -- --port 5173`, then `node docs/towerdefense/concept/codex/glider-redesign/capture-candidate.mjs`; requires installed playwright-core and `/usr/bin/chromium`.

Files actually produced:
- `source-raw.png` — original generated transparent image.
- `candidate.png` — normalized 640×640 transparent candidate.
- `candidate-ground.png` — candidate on #211d19 for inspection.
- `capture-candidate.mjs` — browser comparison script.
- `map-comparison-2x.png` — current puppet versus fresh candidate on both map surfaces, at 45px and 140px.
- `preview-validation.json` — scale, bounds, background, candidate status and browser errors.
- `NOTES.md` — this report.
