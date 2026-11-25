// After a live build (LIVE_BASE set): dump every game's tunable defaults and snapshot format, then write
// dist/live/manifest.json (this version) and dist/live/feed.json (the previous feed + this version).
// Env: LIVE_BASE, LIVE_SHA, LIVE_MESSAGE, LIVE_TIME (epoch s), LIVE_PREV_FEED (path to the previous feed.json, optional).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { allGames } from '../../src/games/registry';
import { createGameSession, NullInput, testProfile, TuningRegistry } from '../../src/core';
import { FIXED_DT } from '../../src/contracts';
import type { GameModule } from '../../src/contracts';
import { appendToFeed, tuningHash } from '../../src/live/feed';
import type { LiveFeed, LiveManifest, TuneDefault } from '../../src/live/types';
import type { LiveBuildInfo } from './vitePlugin';


/** Run a game headless for a while and collect the tunables it registers (some register lazily). */
export function dumpTuning(game: GameModule, seconds = 120): Record<string, TuneDefault> {
  const registry = new TuningRegistry({ profileId: 'live-dump', storage: null });
  try {
    const s = createGameSession({ game, profile: testProfile(), input: new NullInput(), fake: { script: 'z2' }, seed: 1, tuningRegistry: registry, simOpts: { autopilot: true, menu: false } });
    for (let i = 0; i < Math.round(seconds / FIXED_DT) && !s.sim.isOver(); i++) s.step(1);
  } catch (e) { console.warn(`live: tuning dump for ${game.id} stopped early: ${e instanceof Error ? e.message : e}`); }
  const out: Record<string, TuneDefault> = {};
  for (const e of registry.list(game.id)) out[e.name] = { d: e.def, ...(e.min !== undefined ? { min: e.min } : {}), ...(e.max !== undefined ? { max: e.max } : {}) };
  return out;
}

function main() {
  const base = process.env.LIVE_BASE; if (!base) throw new Error('LIVE_BASE is not set');
  const dist = process.argv[2] ?? 'dist';
  const build = JSON.parse(readFileSync(`${dist}/live/build.json`, 'utf8')) as LiveBuildInfo;
  const sha = process.env.LIVE_SHA ?? 'local';
  const manifest: LiveManifest = {
    sha, short: sha.slice(0, 7), message: (process.env.LIVE_MESSAGE ?? '').split('\n')[0].slice(0, 200),
    time: Number(process.env.LIVE_TIME ?? 0) * 1000 || Date.now(), base, shell: build.shell, games: {}, tuning: {},
  };
  for (const game of allGames) {
    const b = build.games[game.id]; if (!b) continue;
    const tuning = dumpTuning(game);
    manifest.tuning[game.id] = tuning;
    manifest.games[game.id] = { entry: b.entry, sim: b.sim, render: b.render, tuning: tuningHash(tuning), snapshot: game.snapshotFormat ?? 1 };
  }
  const prevPath = process.env.LIVE_PREV_FEED;
  let prev: LiveFeed = { versions: [] };
  if (prevPath && existsSync(prevPath)) { try { prev = JSON.parse(readFileSync(prevPath, 'utf8')); } catch { console.warn('live: previous feed unreadable, starting a new one'); } }
  const { tuning: _t, ...entry } = manifest;
  writeFileSync(`${dist}/live/manifest.json`, JSON.stringify(manifest));
  writeFileSync(`${dist}/live/feed.json`, JSON.stringify(appendToFeed(prev, entry)));
  console.log(`live: ${manifest.short} with ${Object.keys(manifest.games).length} games, feed ${appendToFeed(prev, entry).versions.length} versions, digest ${createHash('sha256').update(JSON.stringify(manifest)).digest('hex').slice(0, 8)}`);
}

if (process.argv[1]?.endsWith('manifest.ts')) main();
