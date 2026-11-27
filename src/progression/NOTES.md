# progression (Agent D)

Exports (`src/progression/index.ts`): `ProfileStore`, `SessionStore`, `awardSession`, `updateCounters`, `defaultProfile(name?)`, `defaultSettings()`, `levelForXp`, `xpForLevel`, `ACHIEVEMENTS`, `ACHIEVEMENT_GAME` (id → game), `CORE_ACHIEVEMENTS`, `achievementValue`, `achievementProgress`.

- Wardrobe migration: `cosmetics/migrate.ts` maps old reward picks, drops retired equipment and ownership snapshots, and persists once. Old/new profiles use current unlock rules; import/export strips retired ownership. Achievement goals and XP are unchanged.
- `ProfileStore(dbName?)`: `list/get/create(name, init?)/update/delete/getLastProfileId/setLastProfileId/exportJson/importJson` (import merges by id, returns count). Settings are merged over defaults on read. `updateGameData` writes one game slot. `award` writes XP and cosmetics and keeps game slots already stored.
- `SessionStore(dbName?)`: `save(record)`, `list(profileId, limit?)` newest first, `clear`; keeps last 200 per profile.
- `awardSession(profile, record) -> { profile, xpGained, baseXp, levelUps: number[], newAchievements: {id,name,bonusXp}[] }` (pure; does not mutate input; caller persists).
- XP = round(kJ) + 2*activeMin (samples with cadence>20 at 1 Hz) + round(zone2 min) + 5*sprints + achievement bonuses. Zone 2 = `stats.zoneSeconds[1]` (index 0 = zone 1).
- `MIN_AWARD_ACTIVE_S` = 120: shorter rides (by duration or pedalling samples) earn no XP/achievements and do not advance lifetime, calendar, variety or game counters. The shell uses the same minimum for warm-up credit; previews and saved awards share this gate.

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

- Games in `wipGames` (under construction) are left out of `ACHIEVEMENTS`/`ACHIEVEMENT_GAME`: no awards, no counters, until they ship.

## Power profile (`powerProfile.ts`, `Profile.power`)
- Shared by every game: best mean power at `POWER_DURATIONS` (5 s, 15 s, 30 s, 1 min, 5 min, 20 min). The shell folds in every real, real-time ride (`updatePowerProfile` in `creditRecord`; never the fake bike or a sped-up clock), however short (no `MIN_AWARD_ACTIVE_S` gate). The Summary lists the bests a ride set (`AwardView.powerBests`); Rider settings show the table and offer the FTP estimate.
- Measuring: 1 Hz samples, glitches above `maxW` and lone spikes replaced by neighbours, windows never span a recording gap.
- Storage per duration: `allTime` (kept forever) + `recent`, a frontier (oldest first, each higher than every newer one; dropped after `keepDays`). Form fade: a best keeps full value `graceDays`, then `fadePerDay` to `fadeFloor`, measured from `lastRideAt` so sims stay deterministic.
- Reading (games): `powerCurve(ctx.profile)` → `at(s)` (measured / log-log interpolated / extrapolated by `TYPICAL_SHAPE` / FTP-only), `fraction(s)`, `best(d)`, `hasHard(min,max)`, `ftpEstimate`. Only set targets from **hard** efforts (`HARD_FTP` × FTP): an easy ride's "best 5 s" is a lower bound, not a sprint. Keep game-side scaling in the game's tunables (see Full Send `profileHold`/`profileReach`).
- `ftpEstimate` = 95 % of a hard 20 min; never lowers FTP, never applied without the rider.
- Helpers for games: `personalFtp(curve, ftpW, durS, {share, minFtp, maxFtp, reach})` (share × your best for the length, clamped; null without a hard effort near it) and `shapeRatio(curve, ftpW, durS)` (your best ÷ the typical curve × FTP; 1 = typical). Users: core sprint detection, Seaside, Cadenza, Purgatour, Hamstergrid, Lighthouse, Full Send.
- Not backfilled from `SessionStore` (old records don't say if they were fake).

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

- `settings.debugStats` defaults false (including legacy profiles), persists per player through storage/backup, and never stores timing samples.
