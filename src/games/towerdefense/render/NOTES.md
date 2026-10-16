# Battlefield integration (#133), on PR #139

- Art direction: retain the textured painted terrain, brass/steel machinery and all eight cut-out alien rigs.
- Brood outlines plus cached ground auras separate aliens from the terrain; bosses use a stronger gold aura.
- The registered painting draws once; its perimeter fades into atmospheric portrait/HUD margins without reflections.
- The painting and all actors share the MAP_INTEGRATION.md registration and field-unit sizing.
- Exact right-lane controls and plateau pads adopted together in sim/defs.ts.
- All pads clear floor/shoulder geometry and all level-one tower kinds reach their assigned lane.
- Compact corner/top controls expose the landscape field; padded outpost art remains above HUD insets.
- Environment overlays use manifest pivots; creep advances along clipped floors and the Flamer leaves char.
- Entry colonies combine creep beds, smaller burrows and Broodmother egg clusters from the same puppet kit.
- Creep/burrow emissions take the brood colour while their material images retain their original palette.
- Brood-tinted splats and curled husks remain for the wave, then fade; both are capped at 160 decals.
- Six continuous conduits start beneath the turret and finish beneath tower pads, via their cable anchors.
- Inner conduits follow the gaps between lane curves; outer conduits go around the battlefield. No hidden breaks.
- Pulse launches interpolate every half crank revolution; travel uses elapsed seconds.
- Outpost: crank-driven flywheel, cosmetic rider through the masked cab, six-phase Gatling, sequential rail caps.
- Selected weapon head aims; HP thresholds enable cumulative damage overlays and shot effects light the muzzle.
- Towers: level parts, fixed Tesla/Prism heads, manifest effect timing, aimed Mortar and barrel recoil.
- Ground lighting before actors preserves silhouette contrast; cached quarter-resolution ambient darkness
  changes only with layout/structures. Transient additive lights are capped at 32 sources.
- Machinery/alien assets load at mount, so renderer construction remains safe in the Node inset checks.
- The loading screen holds simulation/countdown until all manifests, images and glows decode and initial poses bake.
- Asset failure offers Back; leaving cancels pose preparation and prevents a late gameplay loop.
- Alien frame sets bake incrementally, round-robin; future resize poses still publish rest poses first.
- Live boss outlines reuse canvases and unchanged sampled poses; its independent scythe strike remains.
- Five-seed 30-minute Zone 2 sweep: towerDamageMult 0.9 yields 42.5–49.2% turret damage,
  34 waves survived and 6–7 bosses killed. Existing 40–60% share targets are retained.
- Review harness: dev/td-battlefield.html?sec=619&inset=110; manual=1 exposes __advance(ms).
- stress=150 uses swarm-heavy mixed species plus one boss; weapon=flame/rail and damage=1 exercise effects.
- Checks: typecheck, towerdefense/inset Vitest tests, production build, browser captures across orientations.
- Real iPad/Bluefy frame-rate validation remains a hardware check; Chromium timings are not an iPad claim.
- Merge #141: retain shared HUD actions/radial construction; reserve the fallback dock only without shell controls.
