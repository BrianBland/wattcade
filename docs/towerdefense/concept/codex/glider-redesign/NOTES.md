# Roster-referenced Glider candidate

Generated anew with OpenAI `image_gen.imagegen` (model ID not exposed), using `../puppet-tools/roster-source.png` as the actual input reference. Replaces the previous brown-bodied candidate in this folder. Original roster Glider anatomy/style: glossy dark metallic chitin, silver-edged armor and finger bones, paired skull horns, original electric-blue eyes/seams, broad consistently blue wing panels and barbed tail.
The blue membranes replace the original grey/beige wing panels while preserving the roster's metallic accents. This is a transparent **unsegmented design candidate**: glow is baked into the image, with no manifest, pivots or animation supplied. The existing puppet and Skitter are unchanged. No game code changed.
ImageMagick normalizes the raw generated image into a padded 640×640 candidate and builds the plain-ground preview. `roster-style-check.png` places the original eight-creature sheet beside the new candidate for direct family/style comparison.
Map comparison uses the game's actual `/td/environment/background.webp`, existing `dev/td-rig.ts` for the current puppet, Chromium deviceScaleFactor=2 and nominal head-to-tail lengths of 45px and 140px. Candidate scale uses its actual opaque bounds. No tint, outline or underglow aids; zero page/load errors. Rows sample tan floor and dark rock.
The saturated blue panels and silver accents read on both surfaces at45px. The new candidate's static pose differs from the animated puppet's0.3s pose; this is a design comparison rather than identical animation frames. Prior puppet joint-test results do not apply to this unrigged image.
Reproduce browser preview with existing `capture-candidate.mjs`: run `npm run dev -- --port 5173`, then `node docs/towerdefense/concept/codex/glider-redesign/capture-candidate.mjs`; requires installed playwright-core and `/usr/bin/chromium`.

Files actually produced or refreshed in this pass:
- `source-raw.png` — new transparent generated image, with roster as input reference.
- `candidate.png` — normalized640×640 transparent candidate.
- `candidate-ground.png` — candidate on#211d19 for inspection.
- `roster-style-check.png` — original roster beside the new metallic-blue Glider.
- `map-comparison-2x.png` — current puppet versus new candidate on both map surfaces at45px and140px.
- `preview-validation.json` — scale, bounds, background, candidate status and browser errors.
- `NOTES.md` — this report.
