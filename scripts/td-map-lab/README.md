# td-map-lab: road + pad layout mocks for Dynamo Defense

Scratch tooling from the Nov 2026 road exploration (kept so the level-generation work can reuse it). Not part of the
game build. Run from the repo root with tsx.

- `lib.ts`: a `Design` (waypoints, turret, turret radius, road half-width/shoulder, bridges, Glider spawns), road
  sampling, self-clearance, crossing detection, pad validity, a coverage **score** (Flamer reach share, longest
  unreachable gap, Tesla overlap, Glider coverage, pads covering two road passes, how early the road nears the turret)
  and `searchPads` (simulated annealing of 12 pads with a graded penalty for invalid layouts).
- `path.ts`: builds deliberate roads from straight runs, circular arcs and spirals (better than hand waypoints).
- `designs1–6.ts`: the mock passes (dive+zigzag, spiral, arches, lasso, trident, ring-in/bridge-out variants).
  `designs4.ts` holds the best comparison set; `designs6.ts` the ring-in/bridge-out exits.
- `render.ts` + `run.mts`: SVG panels with metrics; `npx tsx scripts/td-map-lab/run.mts scripts/td-map-lab/designs4.ts /tmp/pass 1,2,3 20000`
  → `/tmp/pass.png` (needs ImageMagick).
- `export.ts`: writes `dev/td-ground-maps.json` (the three maps the ground harness renders).

Findings are summarised in `docs/towerdefense/LEVELS-HANDOFF.md`.
