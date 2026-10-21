# Approved fireball head — production round 1
Owner feedback: "Fireball turret lgtm" (2026-10-17); tower selection remains pending.
Exported the approved round-1 head without repainting or regenerating its pixels.
Production crop is 118×200 with four clear pixels on every edge; pivot remains [260,260].
The single muzzle is [260,148], at the ember-loaded launch mouth; old twin positions are removed.
Emission contains only the hot ember/nozzle interior, with steel and brass non-emissive.
The real deck, Gatling, Rail, cab, flywheel and all other parts remain byte-identical.
Preview rebuild changes only the three fireball cells; all other decoded preview pixels are identical.
The proof shows 0°/±60° at the exact 220px deck size, with emission off/on and cyan muzzle markers.
480 aim/emission poses pass clipping and anchor checks; validation.json records the unchanged files/budget.
Review PNGs/GIFs are generated under /tmp/wattcade-td-art/fireball; rebuild with `python -B docs/towerdefense/art-briefs/flamer-rounds/fireball-production-1/build.py`.
No tower art or gameplay tuning changed; live muzzle/shot checks accompany integration.
