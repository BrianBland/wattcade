# progression (Agent D)

Exports (`src/progression/index.ts`): `ProfileStore`, `SessionStore`, `awardSession`, `defaultProfile(name?)`, `defaultSettings()`, `levelForXp`, `xpForLevel`, `ACHIEVEMENTS`.

- `ProfileStore(dbName?)`: `list/get/create(name, init?)/update/delete/getLastProfileId/setLastProfileId/exportJson/importJson` (import merges by id, returns count). Settings are merged over defaults on read.
- `SessionStore(dbName?)`: `save(record)`, `list(profileId, limit?)` newest first, `clear`; keeps last 200 per profile.
- `awardSession(profile, record) -> { profile, xpGained, baseXp, levelUps: number[], newAchievements: {id,name,bonusXp}[] }` (pure; does not mutate input; caller persists).
- XP = round(kJ) + 2*activeMin (samples with cadence>20 at 1 Hz) + round(zone2 min) + 5*sprints + achievement bonuses. Zone 2 = `stats.zoneSeconds[1]` (index 0 = zone 1).

## Conventions games must follow
- Game ids: `dungeon`, `lighthouse`, `towerdefense`.
- `storm_chaser`: lighthouse should emit `stormWeathered` events (or set `gameSummary.stormsWeathered`); count accumulates in `profile.gameData._progression.stormsWeathered` (progression-owned slot; games must not write `_progression`).
- `triple_rail`: event `railFired` with data `{charges: 3}`. `dungeon_clear`: event `bossDefeated`.

## Test
`npx vitest run src/progression`

## Gaps
- None known.
