/** Fresh-save, first-run balance sweep. Never counts auto-restarts or garage investment.
 * npx tsx scripts/td-balance.ts [--seeds=1,2,3,4,5,6,7,8] [--minutes=90]
 *   [--multipliers=1.1,1.15,1.2] [--riders=z2,responsive,actions,recovery] [--json]
 */
import { FIXED_DT } from '../src/contracts';
import { createGameSession, SCRIPTS, testProfile, TimelineInput, TuningRegistry, type GameSession } from '../src/core';
import { module } from '../src/games/towerdefense';
import type { TdSnapshot } from '../src/games/towerdefense/sim/types';
import { waveRole } from '../src/games/towerdefense/sim/waves';

const arg = (name: string, fallback: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const seeds = arg('seeds', '1,2,3,4,5,6,7,8').split(',').map(Number);
const multipliers = arg('multipliers', 'default').split(',').map(n => n === 'default' ? undefined : Number(n));
const minutes = Number(arg('minutes', '90'));
const riders = {
  z2: { script: 'z2', actionBot: false },
  responsive: { script: 'hook-responsive', actionBot: false },
  actions: { script: 'hook-responsive', actionBot: true },
  recovery: { script: 'hook-responsive', actionBot: true, recover: true },
};
const selected = arg('riders', 'z2,responsive,actions').split(',');
if (selected.some(r => !(r in riders)) || [...seeds, ...multipliers.filter(n => n !== undefined), minutes].some(n => !Number.isFinite(n) || n <= 0)) {
  throw new Error('Use positive seeds, multipliers and minutes, and riders z2,responsive,actions,recovery.');
}
const round = (n: number) => Math.round(n * 1000) / 1000;

function measure(seed: number, rider: keyof typeof riders, multiplier?: number) {
  const { script, actionBot } = riders[rider];
  let recovering = true;
  const runScript = rider === 'recovery' ? 'td-balance-recovery' : script;
  if (rider === 'recovery') SCRIPTS[runScript] = { ...SCRIPTS[script],
    name: runScript, powerFtp: (t, env) => recovering ? 0.5 : SCRIPTS[script].powerFtp?.(t, env) };
  const profile = testProfile();
  let session: GameSession;
  let ended = false, elapsedS = 0, wave = 0;
  let finalField: TdSnapshot | undefined;
  const waves: Array<{ wave: number; role: string; startS: number; durationS?: number; leak: number; heal?: number; hp?: number; scrap?: number; towers?: number; levels?: number; damageByKind: Record<string, number> }> = [];
  session = createGameSession({
    game: module, profile, input: new TimelineInput(SCRIPTS[runScript].input), seed, fake: { script: runScript },
    tuningRegistry: new TuningRegistry({ profileId: profile.id, storage: null }),
    simOpts: { autopilot: true, actionBot },
    onEmit(e) {
      if (e.type === 'broodAnnounced') recovering = true;
      if (e.type === 'waveStart') {
        wave = Number(e.data?.wave);
        recovering = waveRole(wave) === 'easy';
        waves.push({ wave, role: waveRole(wave), startS: round(e.t), leak: 0, damageByKind: {} });
      }
      const w = waves.at(-1);
      if (e.type === 'baseHit' && w) {
        const kind = String(e.data?.kind), damage = Number(e.data?.dmg);
        w.leak += damage; w.damageByKind[kind] = (w.damageByKind[kind] ?? 0) + damage;
      }
      if (e.type === 'waveCleared' && w) {
        const field = session.sim.snapshot() as TdSnapshot;
        Object.assign(w, { durationS: round(e.t - w.startS), heal: Number(e.data?.heal), hp: field.baseHp, scrap: field.scrap,
          towers: field.towers.length, levels: field.towers.reduce((n, t) => n + t.level, 0) });
      }
      if (e.type === 'runEnded') {
        ended = true; elapsedS = e.t;
        // endRun emits before removing the towers and returning to the Garage.
        finalField = session.sim.snapshot() as TdSnapshot;
      }
    },
  });
  if (multiplier !== undefined) session.tuning.set('towerdefense.towerDamageMult', multiplier);
  const effectiveMultiplier = Number(session.tuning.get('towerdefense.towerDamageMult'));
  for (let tick = 0; tick < Math.round(minutes * 60 / FIXED_DT) && !ended; tick++) session.step(1);
  finalField ??= session.sim.snapshot() as TdSnapshot;
  if (!ended) elapsedS = session.clock.now();
  const summary = session.sim.summary();
  const totalDamage = Number(summary.turretDamage) + Number(summary.towerDamage) + Number(summary.empDamage);
  const events = session.finish().events;
  if (rider === 'recovery') delete SCRIPTS[runScript];
  const easy = waves.filter(w => w.role === 'easy');
  return {
    seed, rider, multiplier: effectiveMultiplier, fell: ended, minutes: round(elapsedS / 60), wave, fallingWave: finalField.wave,
    turretShare: round(Number(summary.turretDamage) / Math.max(1, totalDamage)),
    towerShare: round(Number(summary.towerDamage) / Math.max(1, totalDamage)),
    callWinRate: round(Number(summary.callsWon) / Math.max(1, Number(summary.callsWon) + Number(summary.callsFailed))),
    bossesEscaped: events.filter(e => e.type === 'bossEscaped').length,
    easyWaves: easy.length, easyDamage: easy.reduce((n, w) => n + w.leak, 0),
    scrapLeft: finalField.scrap, levels: finalField.towers.reduce((n, t) => n + t.level, 0),
    towers: finalField.towers.map(t => ({ pad: t.pad, kind: t.kind, level: t.level })),
    summary, waves,
  };
}

const results = [];
for (const multiplier of multipliers) for (const rider of selected) for (const seed of seeds) {
  const r = measure(seed, rider as keyof typeof riders, multiplier);
  results.push(r);
  if (!process.argv.includes('--json')) console.log(JSON.stringify({ ...r, towers: undefined, summary: undefined, waves: undefined,
    wavesCleared: r.summary.wavesCleared, towersBuilt: r.summary.towersBuilt, towerUpgrades: r.summary.towerUpgrades,
    bossesKilled: r.summary.bossesKilled, scrapEarned: r.summary.scrapEarned }));
}
if (process.argv.includes('--json')) console.log(JSON.stringify({ maxMinutes: minutes, ftp: 200, results }, null, 2));
