# Duckbill — production round 2
- Owner picked the Round 1 duckbill over the live compact burner A (2026-11-20) and asked for more distinct levels, partly via glow.
- Sources: Round 1 concept heads (git ac63e3b), generated over the real pad/Mortar chassis, split here without repainting.
- Each tier's duckbill (trapezoid mask) is the recoiling nozzle (1.5 px); the rest is its aiming head (pivot [112,112]).
- Tiers replace each other through `maxLevel`: L1-2, L3-4 (heat-shield cowl), L5 (big tanks, gauges). L2/L4 keep the Mortar base fittings.
- Glow comes only from the burner mouth and the central pilot window; `glowByLevel` 0.75 → 1.9 heats every level.
- In game the renderer adds per-level idle flame licks and mouth light, and the pixel flame spray (blastFx).
- Muzzle (mouth top edge): L1/L2 [112,56], L3-L5 [112,42]. Flare strips reuse the L3 slot's hot pixels.
- Review sheet: $TD_ART_REVIEW_OUT (default /tmp/wattcade-td-art/duckbill)/duckbill-levels.png.
