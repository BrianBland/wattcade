# progression (Agent D)

Exports (`src/progression/index.ts`): `ProfileStore`, `SessionStore`, `awardSession`, `updateCounters`, `defaultProfile(name?)`, `defaultSettings()`, `levelForXp`, `xpForLevel`, `ACHIEVEMENTS`, `ACHIEVEMENT_GAME` (id → game), `CORE_ACHIEVEMENTS`, `achievementValue`, `achievementProgress`.

- `ProfileStore(dbName?)`: `list/get/create(name, init?)/update/delete/getLastProfileId/setLastProfileId/exportJson/importJson` (import merges by id, returns count). Settings are merged over defaults on read.
- `SessionStore(dbName?)`: `save(record)`, `list(profileId, limit?)` newest first, `clear`; keeps last 200 per profile.
- `awardSession(profile, record) -> { profile, xpGained, baseXp, levelUps: number[], newAchievements: {id,name,bonusXp}[] }` (pure; does not mutate input; caller persists).
- XP = round(kJ) + 2*activeMin (samples with cadence>20 at 1 Hz) + round(zone2 min) + 5*sprints + achievement bonuses. Zone 2 = `stats.zoneSeconds[1]` (index 0 = zone 1).

- Award order: lifetime/lastPlayed/`rideDays` (local days, last 120) → `counters` (each `count.key` once) → achievements in list order
  (core, games in `allGames` order, then `overachiever`, which sees the ids earned earlier in the same award).
- `rideStats.ts` (pure): power→speed model for virtual km / climb (sim-mode grade only), peak averages, variability index,
  local-calendar helpers (`localDay`, `weekday`, `weekOf`, `weekStreak`).
- `kit.ts`: helpers games use in `src/games/<id>/achievements.ts` (`feat`, `tally`, `num`, `hasEvent`, `countEvents`). It must not
  import the registry (achievements.ts does; games import kit).

## Conventions games must follow
- Achievement ids never change (Cadenza keeps `wsurf_*`). Achievements read summary keys/events: rename one → update `achievements.ts`;
  `scenarios.test.ts` runs real headless rides and fails if a key goes missing.
- Old profiles: `gameData._progression.stormsWeathered` seeds `counters['lighthouse.storms']`.

## Test
`npx vitest run src/progression` (`scenarios.test.ts` runs headless rides, ~10 s)

## Gaps
- None known.
