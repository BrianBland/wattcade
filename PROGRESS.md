# wattcade progress

- [x] Phase 0 — scaffold (deps, configs, contracts, placeholders, CLAUDE.md, docs/SPEC.md)
- [x] Phase 1 — Wave 1 (A devices, B ride/input/probe, C core, D progression, E shell/debug, F dungeon, G lighthouse, H towerdefense)
- [x] Phase 2 — integrate
  - No CONTRACT-REQUESTs were raised; contracts.ts unchanged.
  - Fixes: Ride system combos per §3.1; FakeTrainer honors ERG under scripts; lifetime storm count in gameData._progression; game tests on runHeadless (stubs deleted); browser smoke fixes (GameHost unmount, no-BT message, overlay offset, favicon, lighthouse canvas sizing).
  - typecheck, test, build, sim:all (11/11) green; manual headless-Chromium flow (profile → connect → each game → pause → summary/XP → reload) OK.
- [x] Phase 3 — QA (docs/QA.md, seeds 1–5 all pass; TD earlyClearHeal 10→14; NaN sanity test), fake-bike keys, lighthouse camera, HARDWARE_TEST.md, README.md; all checks green
- [x] Hardware feedback round 1: Ride service-UUID fallback + two-sided controller group; paddle group layout + expo curve; HR source fix (ignore 0 bpm, prefer HR device).
- [x] Feedback round 2: shared in-game HUD band (zone widget, history, gear/diff, controller legend via GameSim.hud()); HR/FTMS connect progress + timeouts; FTMS connects even if control refused; zoneSource default power; dungeon auto-move/bigger rooms/minimap; lighthouse build costs + zone grace; TD legend; new game Crank Fighter (starfighter, two-button shooter). 14/14 scenarios green.

- [x] Sprocket Squadron first playable (`starfighter` ID retained): music-driven automatic endurance combat, capability-aware Cruiser/ERG Escort selection, run arsenal, flagships, Nova recovery, v3 save conversion, bright perspective carrier/cloud run, paddle priority targeting, musical curved lock volleys, auto-dodge banking/afterimages, flagship batteries/reactor. Spec: docs/SPROCKET_SQUADRON.md. Music follow-ups: GitHub #64–#66. Typecheck/build, repository tests, focused combat checks and portrait/landscape/control/resource browser smoke pass; arcade preview regenerated. Real iPad/trainer validation remains.
