/** Dynamo Defense balance sweeps (continuous combat). Fresh save, autopilot builds and weapon picks.
 *
 * Endless (first fall, never counts auto-restarts):
 *   npx tsx scripts/td-balance.ts [--seeds=1,2,3,4] [--minutes=120] [--riders=z2,on100] [--level=0|narrow] [--json]
 * Campaign grid (stars per rider strength × intensity × level):
 *   npx tsx scripts/td-balance.ts --campaign=0,2,4,12 [--riders=on70,on85,on100,on115] [--intensities=easy,steady,hard] [--seeds=1,2]
 *
 * Riders: `z2` holds 0.65 FTP and never shifts; `onNN` rides `follow-power` (the suggested tier's power) at NN %.
 */
import { FIXED_DT } from '../src/contracts';
import { createGameSession, SCRIPTS, testProfile, TimelineInput, TuningRegistry } from '../src/core';
import { module } from '../src/games/towerdefense';
import { CAMPAIGN } from '../src/games/towerdefense/sim/campaign';
import { LEVEL_0, narrowed } from '../src/games/towerdefense/sim/level';

const arg = (name: string, fallback: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const list = (s: string) => s.split(',').filter(Boolean);
const campaign = list(arg('campaign', '')).map(Number);
const seeds = list(arg('seeds', campaign.length ? '1,2' : '1,2,3,4')).map(Number);
const riders = list(arg('riders', campaign.length ? 'on70,on85,on100,on115' : 'z2,on100'));
const intensities = list(arg('intensities', campaign.length ? 'easy,steady,hard' : 'steady'));
const minutes = Number(arg('minutes', '120'));
const level = arg('level', '0') === 'narrow' ? narrowed(LEVEL_0) : LEVEL_0;
const round = (n: number) => Math.round(n * 1000) / 1000;

function scriptFor(rider: string): string {
  if (rider === 'z2') return 'z2';
  const k = Number(rider.replace(/^on/, '')) / 100;
  if (!/^on\d+$/.test(rider) || !(k > 0)) throw new Error(`Unknown rider ${rider}: use z2 or onNN.`);
  const base = SCRIPTS['follow-power'];
  SCRIPTS[rider] ??= { ...base, name: rider, powerFtp: (t, env) => k * (base.powerFtp?.(t, env) ?? 0) };
  return rider;
}

function measure(rider: string, seed: number, intensity: string, c?: number) {
  const script = scriptFor(rider), profile = testProfile();
  const play = c === undefined ? undefined : { campaign: c };
  const cap = play ? CAMPAIGN[c!].minutes + 12 : minutes;
  let end: { type: string; t: number; stars?: number } | undefined;
  let lost = 0, escaped = 0, killed = 0;
  const session = createGameSession({
    game: module, profile, input: new TimelineInput(SCRIPTS[script].input), seed, fake: { script },
    tuningRegistry: new TuningRegistry({ profileId: profile.id, storage: null }),
    simOpts: { autopilot: true, stars: 99, intensity, ...(play ? { play } : { level }) },
    onEmit(e) {
      if (end) return;
      if (e.type === 'baseHit') lost += Number(e.data?.dmg);
      if (e.type === 'bossEscaped') escaped++;
      if (e.type === 'bossKilled') killed++;
      if (e.type === 'levelCleared') end = { type: 'cleared', t: e.t, stars: Number(e.data?.stars) };
      if (e.type === 'levelFailed' || (!play && e.type === 'runEnded')) end = { type: 'fell', t: e.t, stars: 0 };
    },
  });
  for (let tick = 0; tick < Math.round(cap * 60 / FIXED_DT) && !end; tick++) session.step(1);
  const summary = session.sim.summary();
  const total = Number(summary.turretDamage) + Number(summary.towerDamage);
  session.finish();
  return {
    rider, seed, intensity, level: play ? CAMPAIGN[c!].id : 'endless', end: end?.type ?? 'timeout',
    minutes: round((end?.t ?? session.clock.now()) / 60), stars: end?.stars, lost: Math.round(lost),
    bossesKilled: killed, bossesEscaped: escaped, turretShare: round(Number(summary.turretDamage) / Math.max(1, total)),
  };
}

const results = [];
for (const rider of riders) for (const intensity of intensities) for (const c of campaign.length ? campaign : [undefined]) for (const seed of seeds) {
  const r = measure(rider, seed, intensity, c);
  results.push(r);
  if (!process.argv.includes('--json')) console.log(JSON.stringify(r));
}
if (process.argv.includes('--json')) console.log(JSON.stringify({ ftp: 200, results }, null, 2));
