# progression (Agent D)

Exports (`src/progression/index.ts`): `ProfileStore`, `SessionStore`, `awardSession`, `updateCounters`, `defaultProfile(name?)`, `defaultSettings()`, `levelForXp`, `xpForLevel`, `ACHIEVEMENTS`, `ACHIEVEMENT_GAME` (id → game), `CORE_ACHIEVEMENTS`, `achievementValue`, `achievementProgress`.

- Wardrobe migration: `cosmetics/migrate.ts` maps old reward picks, drops retired equipment and ownership snapshots, and persists once. Old/new profiles use current unlock rules; import/export strips retired ownership. Achievement goals and XP are unchanged.
- `ProfileStore(dbName?)`: `list/get/create(name, init?)/update/delete/getLastProfileId/setLastProfileId/exportJson/importJson` (import merges by id, returns count). Settings are merged over defaults on read. `updateGameData` writes one game slot. `award` writes XP and cosmetics and keeps game slots already stored.
- `SessionStore(dbName?)`: `save(record)`, `list(profileId, limit?)` newest first, `clear`; keeps last 200 per profile.
- `awardSession(profile, record) -> { profile, xpGained, baseXp, levelUps: number[], newAchievements: {id,name,bonusXp}[] }` (pure; does not mutate input; caller persists).
- XP = round(kJ) + 2*activeMin (samples with cadence>20 at 1 Hz) + round(zone2 min) + 5*sprints + achievement bonuses. Zone 2 = `stats.zoneSeconds[1]` (index 0 = zone 1).

- Award order: lifetime/lastPlayed/`rideDays` (local days, last 120) → `counters` (each `count.key` once) → achievements in list order
  (core, games in `allGames` order, then `overachiever`, which sees the ids earned earlier in the same award).
- Pacing (sims, autopilot): a 30-min zone 2 ride ≈ 330 XP; level `400·(L−1)^1.5` → L5 ≈ 10 rides, L10 ≈ 30. A first ride
  unlocks ~1 item and later rides ~1 each. "First time you do X" feats are lifetime tallies; one-ride feats need a long or excellent ride.
- `rebalance.ts`: `RULES_VERSION` (in `levels.ts`, stored at `gameData._progression.rules`, new profiles start current).
  `ProfileStore` re-grades older profiles on read: level from XP, changed achievements revoked (minus their bonus XP)
  unless saved counters still meet the new goal, picks above the new level dropped. Making things harder = bump + list ids.
- `rideStats.ts` (pure): power→speed model for virtual km / climb (sim-mode grade only), peak averages, variability index,
  local-calendar helpers (`localDay`, `weekday`, `weekOf`, `weekStreak`).
- `kit.ts`: helpers games use in `src/games/<id>/achievements.ts` (`feat`, `tally`, `num`, `hasEvent`, `countEvents`). It must not
  import the registry (achievements.ts does; games import kit).

## Conventions games must follow
- Achievement ids are permanent; a rename needs an entry in `core/renames.ts` `RENAMED_ACHIEVEMENTS`. Achievements read summary keys/events: rename one → update `achievements.ts`;
  `scenarios.test.ts` runs real headless rides and fails if a key goes missing.
- Dynamo Defense (#156) adds easy/medium/hard/playtime tiers on the same curve. `td_spotless` and `td_surges` changed meaning (lifetime Spotless waves; called efforts in one run) without a rules bump, so already-earned copies stay.
- Old profiles: `gameData._progression.stormsWeathered` seeds `counters['lighthouse.storms']`.
- Afterglow (`afterglow`) grants the separate Light Cycle Trail. `ride.arcadeTenMinutes` sums arcade sessions with at least 600 active-cadence samples; Warm-up Ride and shorter/idle sessions do not count. This new counter starts with future qualifying rides; it does not guess historical durations from lifetime totals.

## Test
`npx vitest run src/progression` (`scenarios.test.ts` runs headless rides, ~10 s)

## Gaps
- None known.
