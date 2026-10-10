import { describe, it, expect } from 'vitest';
import { createGameSession, runHeadless, testProfile, NullInput, TimelineInput, TuningRegistry, DataHub, FakeTrainer } from '../../../core';
import { synthTimeline } from '../../../media/synth/queue';
import { module } from '../index';
import { scenarios } from '../scenarios';
import { inCombat, MAX_BOLTS, bulletPattern } from '../sim/encounters';
import { newRoute, extendRoute, choreograph, missDistance, routeX, ROUTE } from '../sim/flight';
import { createDirector, cadenceFor } from '../sim/director';
import { escortAvailable, migrateSave } from '../sim/save';
import { upgradeCost, UPGRADES } from '../sim/meta';
import type { SfSave, SfSnapshot } from '../sim/types';
import type { MediaTimeline } from '../../../contracts';

const longMusic = () => synthTimeline({ style: 'mixed', songs: 20, seed: 1 });
function rig(opts: Record<string, unknown> = {}, script = 'z2', timeline?: MediaTimeline, raw?: Record<string, unknown>, input = new NullInput()) {
  const profile = testProfile(); if (raw) profile.gameData.starfighter = raw;
  let saved: SfSave | undefined;
  const tuning = new TuningRegistry({ profileId: profile.id, storage: null });
  const s = createGameSession({ game: module, profile, input, fake: { script }, seed: 3,
    simOpts: { skipHangar: true, ...opts }, ...(timeline ? { media: { timeline } } : {}), tuningRegistry: tuning, onSave: d => { saved = d as SfSave; } });
  return { s, profile, snap: () => s.sim.snapshot() as SfSnapshot, saved: () => saved!, seconds: (secs: number) => s.step(Math.round(secs * 30)) };
}
describe('endurance music combat', () => {
  for (const sc of scenarios) it(sc.name, () => {
    const r = runHeadless({ game: module, ...sc }); expect(sc.assert(r.summary, r.stats, r)).toEqual([]);
  }, 15_000);
  it('fires and grows without input; steady Zone 2 survives music drops', () => {
    const r = rig({}, 'z2', longMusic()); r.seconds(300);
    expect(r.snap().kills).toBeGreaterThan(50); expect(r.snap().gunLevel).toBe(5); expect(r.snap().deaths).toBe(0);
    expect(r.snap().effort).toMatchObject({ floorWatts: 112, ceilingWatts: 150, erg: false });
    expect(r.s.commands.every(c => c.mode !== 'erg')).toBe(true);
  });
  it('sustained shortfall weakens guns and permits ramming; restored riding recovers', () => {
    const r = rig({}, 'idle'); let weakest = 1, lowestShield = 100;
    for (let i = 0; i < 100; i++) { r.seconds(0.25); weakest = Math.min(weakest, r.snap().quality); lowestShield = Math.min(lowestShield, r.snap().shield); }
    expect(weakest).toBeLessThan(0.5); expect(lowestShield).toBeLessThan(100);
    r.s.fakeBike!.useScript('z2'); r.seconds(10);
    expect(r.snap().quality).toBeGreaterThan(0.9); expect(r.snap().effort.status).toBe('on');
  });
  it('brief power dip is tolerated, extra power earns no upgrades or charge', () => {
    const r = rig(); r.seconds(20); r.s.fakeBike!.useScript('idle'); r.seconds(2);
    expect(r.snap().quality).toBeGreaterThan(0.9);
    const fast = rig({}, 'intervals'); fast.seconds(60);
    expect(fast.snap().effort.status).toBe('over'); expect(fast.snap().charge).toBe(0); expect(fast.snap().salvage).toBe(0);
  });
  it('Nova grants protected recovery, reduces ERG target, and cannot recharge during cover', () => {
    const r = rig({ craft: 'escort' }, 'z2', undefined, { v: 2, bank: 1000 });
    r.s.tuning.set('starfighter.novaChargeS', 10); r.seconds(30);
    expect(r.snap().charge).toBe(100); r.s.sim.receive!({ type: 'nova' }); r.seconds(1);
    expect(r.snap().coverLeft).toBeGreaterThan(18); expect(r.snap().effort.status).toBe('recover');
    r.seconds(10); expect(r.snap().charge).toBe(0); expect(r.snap().effort.targetWatts).toBeLessThan(110);
    r.s.sim.receive!({ type: 'nova' }); r.seconds(1); expect(r.snap().coverLeft).toBeLessThan(10);
  });
  it('ERG craft uses measured power and cadence at smoothed, bounded targets', () => {
    const r = rig({ craft: 'escort' }, 'z2', longMusic(), { bank: 1000 }); r.seconds(120);
    expect(r.snap().craft).toBe('escort'); expect(r.snap().wingmen).toBe(2); expect(r.snap().effort.erg).toBe(true);
    expect(r.s.commands.some(c => c.mode === 'erg')).toBe(true);
    expect(r.s.commands.filter(c => c.mode === 'erg').every(c => c.watts <= 141)).toBe(true);
    r.s.fakeBike!.useScript('idle'); let weakest = 1; for (let i = 0; i < 20; i++) { r.seconds(1); weakest = Math.min(weakest, r.snap().quality); } expect(weakest).toBeLessThan(0.5);
  });
  it('bosses announce then appear without imposing intervals, including without beat analysis', () => {
    const r = rig(); r.s.tuning.set('starfighter.bossEveryS', 40); r.s.tuning.set('starfighter.bossHull', 50); r.seconds(34);
    expect(r.snap().bossIn).toBeGreaterThan(5); expect(r.snap().boss).toBeNull(); r.seconds(10);
    expect(r.snap().boss).not.toBeNull(); expect(r.snap().effort.ceilingWatts).toBe(150);
    r.seconds(60); expect(Number(r.s.sim.summary().bossesDefeated)).toBeGreaterThan(0);
  });
  it('idle can regroup indefinitely without terminating playback', () => {
    const r = rig({}, 'idle'); r.seconds(180);
    expect(r.snap().deaths).toBeGreaterThan(0); expect(r.s.sim.isOver()).toBe(false);
  });
  it('ends at the media clock and releases its resistance effect', () => {
    const tl = longMusic(); tl.durationS = 20;
    const r = rig({}, 'z2', tl); r.seconds(22);
    expect(r.s.sim.isOver()).toBe(true); expect(r.snap().t).toBeCloseTo(20, 1);
  });
  it('uncertain online analysis never asks for cadence', () => {
    const tl = longMusic(); tl.confidence = 'metadata';
    const r = rig({}, 'z2', tl); r.s.tuning.set('starfighter.cadenceGapS', 60);
    for (let i = 0; i < 240; i++) { r.seconds(1); expect(r.snap().cadence).toBeNull(); }
  });
  it('full beat analysis can offer a cadence bonus without changing the endurance target', () => {
    const tl = longMusic(); tl.beats = Array.from({ length: 1200 }, (_, i) => i * 0.5); tl.phrases = Array.from({ length: 40 }, (_, i) => i * 16);
    const r = rig({}, 'z2', tl); r.s.tuning.set('starfighter.cadenceGapS', 60); r.seconds(65);
    expect(r.snap().cadence).toMatchObject({ min: 83, max: 97 }); expect(r.snap().effort.ceilingWatts).toBe(150);
  });
  it('same seed and rider produce identical results', () => {
    const run = () => { const r = rig({}, 'z2', longMusic()); r.seconds(100); return r.s.sim.summary(); };
    expect(run()).toEqual(run());
  });
});
describe('musical locks and paddle targeting', () => {
  it('automatically acquires and releases bounded volleys without beat analysis', () => {
    const r = rig(); let sawLocks = false, sawLasers = false;
    for (let i = 0; i < 400; i++) {
      r.seconds(0.1); const s = r.snap(); sawLocks ||= s.locks.length > 0; sawLasers ||= s.lasers.length > 0;
      expect(s.locks.length).toBeLessThanOrEqual(s.lockCapacity); expect(s.lasers.length).toBeLessThanOrEqual(24);
      expect(s.lasers.every(l => Number.isFinite(l.x) && Number.isFinite(l.y))).toBe(true);
    }
    expect(sawLocks).toBe(true); expect(sawLasers).toBe(true); expect(Number(r.s.sim.summary().volleys)).toBeGreaterThan(5);
  });
  it('touch retarget cycles spatially and preserves already painted locks', () => {
    const r = rig(); for(let i=0;i<120;i++){r.seconds(0.1);if(r.snap().enemies.filter(inCombat).length>=3 && r.snap().locks.length>0)break;} const s = r.snap();
    const candidates = s.enemies.filter(inCombat).sort((a,b) => a.x-b.x || a.id-b.id);
    expect(candidates.length).toBeGreaterThan(2);
    const previous = s.selectedId, painted = [...s.locks];
    r.s.sim.receive!({ type: 'target', direction: 1 }); r.seconds(1/30);
    expect(r.snap().selectedId).toBe(candidates[(candidates.findIndex(e => e.id === previous)+1)%candidates.length].id);
    expect(r.snap().locks).toEqual(painted);
    r.s.sim.receive!({ type: 'target', direction: -1 }); r.seconds(1/30); expect(r.snap().selectedId).toBe(previous);
  });
  it('right paddles select targets without activating Nova; left paddles still change Cruiser gears', () => {
    const input = new TimelineInput([{ t: 20.1, press: 'shiftUpR' }, { t: 20.2, release: 'shiftUpR' }, { t: 20.4, press: 'shiftUpL' }]);
    const r = rig({}, 'z2', undefined, undefined, input); r.s.tuning.set('starfighter.novaChargeS',10); r.seconds(20);
    const gear = r.s.ctx.bike().gear; r.seconds(1);
    expect(r.snap().charge).toBe(100); expect(r.snap().coverLeft).toBe(0);
    expect(r.s.recorder.events.some(e=>e.type==='retarget')).toBe(true); expect(r.s.ctx.bike().gear).toBeGreaterThan(gear!);
  });
  it('flagship batteries expose the reactor and leave with an escaping boss', () => {
    const r = rig(); r.s.tuning.set('starfighter.bossEveryS',40); r.s.tuning.set('starfighter.bossHull',200); r.seconds(41);
    expect(r.snap().boss?.stage).toBe('Destroy the batteries');
    expect(r.snap().enemies.filter(e=>!!e.parentId)).toHaveLength(3);
    let exposed=false;
    for(let i=0;i<500;i++){r.seconds(0.1);exposed ||= r.snap().boss?.stage==='Reactor exposed';}
    expect(exposed).toBe(true);
    const idle=rig({},'idle');idle.s.tuning.set('starfighter.bossEveryS',40);idle.s.tuning.set('starfighter.bossTimeoutS',30);idle.seconds(71);
    expect(idle.snap().boss).toBeNull();expect(idle.snap().enemies.some(e=>e.parentId)).toBe(false);
  });
  it('steady riding grazes past choreographed fire; idle never earns volleys or dodges', () => {
    const r = rig({}, 'z2', longMusic()); r.seconds(120);
    expect(Number(r.s.sim.summary().dodges)).toBeGreaterThan(0); expect(r.snap().deaths).toBe(0);
    const idle = rig({}, 'idle', longMusic()); idle.seconds(120);
    expect(Number(idle.s.sim.summary().volleys)).toBe(0); expect(Number(idle.s.sim.summary().dodges)).toBe(0);
  });
});
describe('spectacle encounters', () => {
  it('new formations start outside combat and fly continuously into target range', () => {
    const r=rig();r.seconds(2.1);
    expect(r.snap().enemies.length).toBeGreaterThan(0);
    expect(r.snap().enemies.every(e=>!inCombat(e))).toBe(true);expect(r.snap().selectedId).toBeNull();expect(r.snap().bolts).toHaveLength(0);
    const first=r.snap().enemies.map(e=>({id:e.id,x:e.x,y:e.y}));r.seconds(0.1);
    for(const old of first){const e=r.snap().enemies.find(e=>e.id===old.id)!;expect(Math.hypot(e.x-old.x,e.y-old.y)).toBeGreaterThan(0);expect(Math.hypot(e.x-old.x,e.y-old.y)).toBeLessThan(30);}
    r.seconds(10);expect(r.snap().enemies.some(inCombat)).toBe(true);expect(Number(r.s.sim.summary().volleys)).toBeGreaterThan(0);
  });
  it('steady riding flies a smooth choreographed route that every shot misses', () => {
    const r=rig({},'z2',longMusic());r.seconds(10);let px=r.snap().shipX,pv=0,reversals=0,peak=0,bolts=0,n=0;
    for(let i=0;i<180*30;i++){r.s.step(1);const s=r.snap(),v=(s.shipX-px)*30;px=s.shipX;
      if(Math.abs(v)>2){if(pv&&Math.sign(v)!==Math.sign(pv))reversals++;pv=v;}peak=Math.max(peak,Math.abs(v));bolts+=s.bolts.length;n++;}
    const sum=r.s.sim.summary();
    expect(reversals/3).toBeLessThan(30);expect(peak).toBeLessThan(45);
    expect(Number(sum.absorbed)).toBe(0);expect(Number(sum.grazes)).toBeGreaterThan(100);
    expect(bolts/n).toBeGreaterThan(25);expect(bolts/n).toBeLessThan(100);
  }, 15_000);
  it('choreographed patterns keep clearance from the route, opening gates when rotation cannot', () => {
    let seed=7;const rand=()=>(seed=(seed*16807)%2147483647)/2147483647;
    const route=newRoute();extendRoute(route,0,rand,()=>0);
    for(let i=0;i<300;i++){
      const t=rand()*2,ex=(rand()-0.5)*80,ey=-20+rand()*60,kind=(['drone','gunner','weaver','turret','tank','boss'] as const)[i%6];
      const e={id:1,kind,x:ex,y:ey,hp:1,maxHp:1,age:rand()*20,fireAt:0,bossStyle:0};
      for(const s of choreograph(route,t,ex,ey,bulletPattern(e,routeX(route,t),84),84))expect(missDistance(route,t,ex,ey,s,84)).toBeGreaterThanOrEqual(ROUTE.clearance);
    }
  });
  it('sustains moderate bullet patterns and destroyable ground enemies within fixed budgets', () => {
    const r=rig({},'z2',longMusic());let peak=0,ground=false,tank=false;
    for(let i=0;i<240;i++){r.seconds(1);const s=r.snap();peak=Math.max(peak,s.bolts.length);ground ||= s.enemies.some(e=>e.ground);tank ||= s.enemies.some(e=>e.kind==='tank');expect(s.bolts.length).toBeLessThanOrEqual(MAX_BOLTS);expect(s.enemies.length).toBeLessThanOrEqual(84);}
    expect(peak).toBeGreaterThan(40);expect(ground).toBe(true);expect(tank).toBe(true);expect(Number(r.s.sim.summary().groundKills)).toBeGreaterThan(0);expect(r.snap().deaths).toBe(0);
  });
});
describe('craft selection and save migration', () => {
  it('preserves legacy investment and best without carrying permanent damage bonuses', () => {
    const legacy = { best: 9999, bank: 250, upgrades: { cannons: 2 }, runs: 4 };
    const s = migrateSave(legacy);
    expect(s.legacy).toEqual(legacy); expect(s.legacyBest).toBe(9999); expect(s.best).toBe(0);
    expect(s.unlockCredit).toBe(250 + upgradeCost(UPGRADES[0], 0) + upgradeCost(UPGRADES[0], 1));
    expect(migrateSave(s as unknown as Record<string, unknown>)).toEqual(s);
  });
  it('unlocks Escort through accumulated groove time, persists once, and retains selected craft', () => {
    const r = rig(); r.seconds(620); r.s.sim.dispose!();
    expect(escortAvailable(r.saved())).toBe(true);
    const before = r.saved().onTargetS; r.s.sim.dispose!(); expect(r.saved().onTargetS).toBe(before);
    const next = rig({ craft: 'escort' }, 'z2', undefined, r.saved() as unknown as Record<string, unknown>);
    expect(next.snap().craft).toBe('escort'); expect(next.saved().runs).toBe(2);
  });
  it('locked craft cannot be selected by options or touch', () => {
    const r = rig({ skipHangar: false, craft: 'escort' });
    r.s.sim.receive!({ type: 'craft', craft: 'escort' }); r.seconds(1); expect(r.snap().craft).toBe('cruiser');
    r.s.sim.receive!({ type: 'launch' }); r.seconds(1); expect(r.snap().phase).toBe('run');
  });
  it('keeps the cruiser available and blocks the ERG craft on an unsupported trainer', () => {
    const profile = testProfile(); profile.gameData.starfighter = { bank: 1000 };
    const hub = new DataHub(), trainer = new FakeTrainer(); trainer.capabilities.erg = false; hub.attachTrainer(trainer);
    const s = createGameSession({ game: module, profile, input: new NullInput(), dataHub: hub, fake: false, simOpts: { craft: 'escort', skipHangar: true } });
    s.step(30); const snap = s.sim.snapshot() as SfSnapshot;
    expect(snap.craft).toBe('cruiser'); expect(snap.ergAvailable).toBe(false);
    expect(s.commands.every(c => c.mode !== 'erg')).toBe(true); expect(module.requires?.erg).toBeUndefined();
  });
  it('controller selection and launch match touch behavior', () => {
    const profile = testProfile(); profile.gameData.starfighter = { bank: 1000 };
    const input = new TimelineInput([{ t: 0.2, press: 'right' }, { t: 0.3, release: 'right' }, { t: 0.5, press: 'a' }]);
    const s = createGameSession({ game: module, profile, input, fake: { script: 'z2' } }); s.step(30);
    expect((s.sim.snapshot() as SfSnapshot).craft).toBe('escort'); expect(s.sim.inMenu!()).toBe(false);
  });
});
describe('music director revisions and rhythm', () => {
  it('keeps announced timing and section, consumes new beats once', () => {
    const tl = longMusic(); tl.sections = [{ t0: 0, t1: 10, kind: 'verse', energy: 0.5 }, { t0: 10, t1: 30, kind: 'drop', energy: 1 }]; tl.beats = [0, 1, 2, 3, 4];
    const d = createDirector(tl); expect(d.step(3).upcoming).toMatchObject({ at: 10, kind: 'drop' });
    tl.sections[1] = { t0: 12, t1: 30, kind: 'break', energy: 0.1 }; tl.revision = 1;
    expect(d.step(4).upcoming).toMatchObject({ at: 10, kind: 'drop' }); expect(d.step(4).beat).toBe(false);
    expect(d.step(10).kind).toBe('drop');
  });
  it('chooses comfortable subdivisions and skips unsuitable tempos', () => {
    expect(cadenceFor(120)).toBe(90); expect(cadenceFor(174)).toBe(87); expect(cadenceFor(30)).toBeNull();
  });
});
