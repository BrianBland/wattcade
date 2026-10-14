# Painted battlefield — current curved original-style delivery

Art: OpenAI image_gen.imagegen; exact working inventory in FILES.txt and
SHA256SUMS.txt. The owner rejected the smooth terrain, explored sharper routes,
then restored the preceding curved original-style scene with rich cabling.

Current production source: mockups/original-direction/background-raw.png.
Current review proof: mockups/curved-wiring/real-sprites.png, actual unchanged
alien/tower/outpost rigs at1366×1024CSS@2x. Cabling uses six actual sockets,
textured armoured feeds, curved routing and buried short lane crossings.
Cable texture and proof renderer remain working files, not baked terrain.
No straight-line tactical routes adopted. All three cubic controls retained.

Current produced/updated files:
build.py; scene.py; layout.py; map-layout.json; map-layout-guide.png;
measure.py; terrain-measurements.json; validation.json; MAP_INTEGRATION.md;
production-NOTES.md; NOTES.md; generation.md; FILES.txt; SHA256SUMS.txt.
export/background.webp; export/map-layout.json; export/MAP_INTEGRATION.md;
export/NOTES.md; export/preview.png; export/FILES.txt; export/SHA256SUMS.txt.

Exact exploration artifacts and generation provenance are itemized separately:
mockups/original-direction/NOTES.md; mockups/tactical-layout/NOTES.md;
mockups/curved-wiring/NOTES.md. Every actual nested file appears in FILES.txt.
raw/battlefield-shallow-v5-raw.png throughv8 are rejected smooth-floor studies.
proofs/ contains prior smooth-floor captures and384-pose offset measurement;
proofs/current/ contains the final exported-map captures and384-pose check;
zero pixels outside13-unit envelope;0.0423% sample neutral stones.
archive/deep-v2/ retains earlier deep-trench scene proofs and original script.
archive/map-layout-deep-v2.json retains prior pad placements for comparison.
Original concepts, accepted rigs, raw green sheets and archive/v1 stay retained.

Measurements use geometric masks on decoded WebP. Old smooth-floor RGB/value
and rock-top hue limits are reported as diagnostics, not current pass claims:
textured dirt contains neutral stones; industrial wreckage warms rocky regions.
Numeric pad clearance, curve identity, centreline floor support, fidelity,
all54 retained overlay PNGs, tint/glow registration and1.5MB budget are checked.
Production game code is unchanged. Renderer adoption remains #133.

Rebuild: python -B layout.py; python -B build.py --output /workspace/wattcade/public/td/environment
Verify: same build.py command with --verify-only. Cable mockup: mockups/curved-wiring/capture.mjs
