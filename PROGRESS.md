# wattcade progress

- [x] Phase 0 — scaffold (deps, configs, contracts, placeholders, CLAUDE.md, docs/SPEC.md)
- [x] Phase 1 — Wave 1 (A devices, B ride/input/probe, C core, D progression, E shell/debug, F dungeon, G lighthouse, H towerdefense)
- [x] Phase 2 — integrate
  - No CONTRACT-REQUESTs were raised; contracts.ts unchanged.
  - Fixes: Ride system combos per §3.1; FakeTrainer honors ERG under scripts; lifetime storm count in gameData._progression; game tests on runHeadless (stubs deleted); browser smoke fixes (GameHost unmount, no-BT message, overlay offset, favicon, lighthouse canvas sizing).
  - typecheck, test, build, sim:all (11/11) green; manual headless-Chromium flow (profile → connect → each game → pause → summary/XP → reload) OK.
- [x] Phase 3 — QA (docs/QA.md, seeds 1–5 all pass; TD earlyClearHeal 10→14; NaN sanity test), fake-bike keys, lighthouse camera, HARDWARE_TEST.md, README.md; all checks green
