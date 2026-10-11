import { describe, it, expect } from 'vitest';
import { createGameSession, runHeadless, testProfile, NullInput, TimelineInput, TuningRegistry, DataHub, FakeTrainer } from '../../../core';
import { synthTimeline } from '../../../media/synth/queue';
import { module } from '../index';
import { scenarios } from '../scenarios';
import { inCombat, MAX_BOLTS, bulletPattern, wallPattern, groupOf } from '../sim/encounters';
import { newRoute, extendRoute, choreograph, missDistance, routeX, ROUTE } from '../sim/flight';
import { createDirector, cadenceFor } from '../sim/director';
import { escortAvailable, migrateSave } from '../sim/save';
import { upgradeCost, UPGRADES } from '../sim/meta';
import { arsenalTier, craftLevel, perks } from '../sim/progression';
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
    expect(r.snap().kills).toBeGreaterThan(50); expect(r.snap().gunLevel).toBe(2); expect(r.snap().deaths).toBe(0);
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
    const r = rig(); r.s.tuning.set('starfighter.bossEveryS', 120); r.s.tuning.set('starfighter.bossHull', 50);
    let announced = -1; for (let i = 0; i < 30 * 120 && announced < 0; i++) { r.s.step(1); if (r.snap().bossIn !== null) announced = r.snap().t; }
    expect(announced).toBeGreaterThan(0); expect(r.snap().bossIn).toBeGreaterThan(0); expect(r.snap().boss).toBeNull(); r.seconds(9);
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
  it('touch retarget cycles formations spatially and preserves already painted locks', () => {
    const r = rig(); const groupsOf = () => { const m = new Map<number, number[]>(); for (const e of r.snap().enemies.filter(inCombat)) { const k = groupOf(e); m.set(k, [...(m.get(k) ?? []), e.x]); } return [...m].map(([k, xs]) => ({ k, x: xs.reduce((a, b) => a + b, 0) / xs.length })).sort((a, b) => a.x - b.x || a.k - b.k); };
    for (let i = 0; i < 300; i++) { r.seconds(0.1); if (groupsOf().length >= 3 && r.snap().locks.length > 0) break; }
    const groups = groupsOf(); expect(groups.length).toBeGreaterThan(2);
    const previous = r.snap().selectedGroup, painted = [...r.snap().locks];
    r.s.sim.receive!({ type: 'target', direction: 1 }); r.s.step(1);
    expect(r.snap().selectedGroup).toBe(groups[(groups.findIndex(g => g.k === previous) + 1) % groups.length].k);
    expect(r.snap().locks.slice(0, painted.length)).toEqual(painted);
    r.s.sim.receive!({ type: 'target', direction: -1 }); r.s.step(1); expect(r.snap().selectedGroup).toBe(previous);
  });
  it('both shifters change Cruiser gears; analog paddles retarget; B releases locks; Z snaps to an elite or flagship', () => {
    const input = new TimelineInput([{ t: 20.1, press: 'shiftUpR' }, { t: 20.2, release: 'shiftUpR' }, { t: 20.4, press: 'shiftUpL' }, { t: 20.5, release: 'shiftUpL' },
      { t: 20.8, paddleR: 0.9 }, { t: 21.0, paddleR: 0 }]);
    const r = rig({}, 'z2', undefined, undefined, input); r.s.tuning.set('starfighter.novaChargeS',10); r.seconds(20);
    const gear = r.s.ctx.bike().gear!; r.seconds(0.35); expect(r.s.ctx.bike().gear).toBeGreaterThan(gear);
    const afterOne = r.s.ctx.bike().gear!; r.seconds(0.3); expect(r.s.ctx.bike().gear).toBeGreaterThan(afterOne);
    r.seconds(1); expect(r.snap().charge).toBe(100); expect(r.snap().coverLeft).toBe(0);
    expect(r.s.recorder.events.filter(e => e.type === 'retarget')).toHaveLength(1);
    // B: painted locks fire on the next beat instead of waiting for the bar.
    const b = rig({}, 'z2', longMusic()); for (let i = 0; i < 900 && !(b.snap().locks.length >= 2 && b.snap().volleyFlash === 0); i++) b.s.step(1);
    const volleys = Number(b.s.sim.summary().volleys); b.s.sim.receive!({ type: 'release' }); b.seconds(0.6);
    expect(Number(b.s.sim.summary().volleys)).toBe(volleys + 1);
    // Z: snap to an elite wing while one is crossing.
    const z = rig({}, 'z2', longMusic()); for (let i = 0; i < 30 * 600 && !z.snap().eliteHint; i++) z.s.step(1);
    z.s.sim.receive!({ type: 'snap' }); z.s.step(1);
    expect(z.snap().enemies.find(e => e.id === z.snap().selectedId)?.elite).toBe(true);
  });
  it('flagship batteries expose the reactor and leave with an escaping boss', () => {
    const r = rig(); r.s.tuning.set('starfighter.bossEveryS',120); r.s.tuning.set('starfighter.bossHull',200);
    for (let i = 0; i < 30 * 120 && !r.snap().boss; i++) r.s.step(1); r.seconds(1);
    expect(r.snap().boss?.stage).toBe('Destroy the batteries');
    expect(r.snap().enemies.filter(e=>!!e.parentId)).toHaveLength(3);
    let exposed=false;
    for(let i=0;i<500;i++){r.seconds(0.1);exposed ||= r.snap().boss?.stage==='Reactor exposed';}
    expect(exposed).toBe(true);
    const idle=rig({},'idle');idle.s.tuning.set('starfighter.bossEveryS',120);idle.s.tuning.set('starfighter.bossTimeoutS',30);
    for (let i = 0; i < 30 * 120 && !idle.snap().boss; i++) idle.s.step(1); expect(idle.snap().boss).not.toBeNull(); idle.seconds(31);
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
  it('route moves leave and land on beats, and sweep across the field on phrase boundaries', () => {
    let seed=11;const rand=()=>(seed=(seed*16807)%2147483647)/2147483647;
    const beat=(at:number)=>Math.ceil(at*2-1e-9)/2, phrase=(at:number)=>Math.ceil(at/8-1e-9)*8;
    const route=newRoute(),seen=new Set<(typeof route.moves)[number]>();
    for(let t=0;t<120;t+=1){extendRoute(route,t,rand,()=>0,beat,phrase);route.moves.slice(1).forEach(m=>seen.add(m));}
    const moves=[...seen];expect(moves.length).toBeGreaterThan(30);
    for(const m of moves){expect(m.start*2%1).toBeCloseTo(0,6);expect(m.end*2%1).toBeCloseTo(0,6);expect(m.end).toBeGreaterThan(m.start);}
    const sweeps=moves.filter(m=>m.start%8===0);expect(sweeps.length).toBeGreaterThan(moves.filter(m=>m.start>=moves[0].start).length/8);
    for(const m of sweeps)expect(Math.abs(m.to-m.from)).toBeGreaterThan(20);
  });
  it('choreographed patterns keep clearance from the route, opening gates when rotation cannot', () => {
    let seed=7;const rand=()=>(seed=(seed*16807)%2147483647)/2147483647;
    const route=newRoute();extendRoute(route,0,rand,()=>0);
    for(let i=0;i<300;i++){
      const t=rand()*2,ex=(rand()-0.5)*80,ey=-20+rand()*60,kind=(['drone','gunner','weaver','turret','tank','boss'] as const)[i%6];
      const e={id:1,kind,x:ex,y:ey,hp:1,maxHp:1,age:rand()*20,fireAt:0,bossStyle:0};
      for(const s of choreograph(route,t,ex,ey,bulletPattern(e,routeX(route,t),84),84))expect(missDistance(route,t,ex,ey,s,84)).toBeGreaterThanOrEqual(ROUTE.clearance);
    }
  });
  it('walls open a wide gate on the route, and formations report clears and perfects', () => {
    const route=newRoute();extendRoute(route,0,()=>0.5,()=>0);
    const e={id:1,kind:'gunner' as const,x:0,y:0,hp:1,maxHp:1,age:0,fireAt:0,bossStyle:0};
    const raw=wallPattern(e,routeX(route,0),84),gated=choreograph(route,0,0,0,raw,84,true);
    expect(gated.length).toBeLessThan(raw.length);expect(gated.length).toBeGreaterThan(raw.length/2);
    for(const s of gated)expect(missDistance(route,0,0,0,s,84)).toBeGreaterThanOrEqual(ROUTE.clearance*1.8);
    const r=rig({},'z2',longMusic());const events:string[]=[];
    r.s.ctx.emit=((ev:{type:string})=>{events.push(ev.type);}) as typeof r.s.ctx.emit;r.seconds(600);
    const sum=r.s.sim.summary();
    expect(events.filter(t=>t==='wall').length).toBeGreaterThan(3);
    expect(Number(sum.clearPct)).toBeGreaterThan(20);expect(Number(sum.perfects)).toBeGreaterThan(0);expect(Number(sum.absorbed)).toBe(0);
    expect(r.snap().clear.rate).toBeCloseTo(Number(sum.clearPct)/100,1);
  }, 15_000);
  it('elite wings reward attentive targeting and never lower the clear rate when ignored', () => {
    const auto = rig({}, 'z2', longMusic()), smart = rig({ smartTarget: true }, 'z2', longMusic());
    auto.seconds(900); smart.seconds(900);
    const a = auto.s.sim.summary(), b = smart.s.sim.summary();
    expect(Number(a.elitesSeen)).toBeGreaterThan(5); expect(Number(a.elitesCleared)).toBe(0);
    expect(Number(b.elitesCleared)).toBeGreaterThan(2); expect(Number(b.score)).toBeGreaterThan(Number(a.score));
    expect(Math.abs(Number(b.clearPct) - Number(a.clearPct))).toBeLessThan(10);
    expect(Number(a.absorbed) + Number(b.absorbed)).toBe(0);
  }, 20_000);
  it('enemies that get past fly on off-screen instead of vanishing beside the ship', () => {
    const r = rig({}, 'z2', longMusic()); r.seconds(20); let last = new Map(r.snap().enemies.map(e => [e.id, { ...e }])), passed = 0, vanishedNearShip = 0;
    for (let i = 0; i < 30 * 240; i++) {
      r.s.step(1); const now = new Map(r.snap().enemies.map(e => [e.id, { ...e }]));
      for (const [id, e] of last) if (!now.has(id) && e.passing) { passed++; if (e.y < 125 && Math.abs(e.x) < 100) vanishedNearShip++; }
      last = now;
    }
    expect(passed).toBeGreaterThan(20); expect(vanishedNearShip).toBe(0); expect(r.snap().deaths).toBe(0);
  }, 15_000);
  it('lancers telegraph beams a bar ahead, fire on beats, miss an on-target rider and can be cancelled by killing them', () => {
    const tl = longMusic(), r = rig({}, 'z2', tl); const fires: number[] = []; let warns = 0;
    r.s.ctx.emit = ((ev: { type: string }) => { if (ev.type === 'beam') fires.push(r.s.ctx.media!.positionS()); if (ev.type === 'beamWarn') warns++; }) as typeof r.s.ctx.emit;
    let longest = 0; for (let i = 0; i < 30 * 300; i++) { r.s.step(1); for (const b of r.snap().beams) longest = Math.max(longest, b.fireAt - b.warnAt); }
    expect(fires.length).toBeGreaterThan(20); expect(warns).toBeGreaterThan(fires.length);
    expect(fires.every(f => tl.beats.some(b => Math.abs(b - f) < 0.04))).toBe(true); expect(longest).toBeGreaterThan(1);
    expect(Number(r.s.sim.summary().absorbed)).toBe(0); expect(r.snap().deaths).toBe(0);
  }, 15_000);
  it('the route turns gently only over open biomes, and ground units stay put in the world', () => {
    const r = rig({}, 'z2', longMusic()); let turnedIso = false, maxRate = 0;
    const tracked = new Map<number, { x: number; z: number }>();
    for (let i = 0; i < 30 * 900; i++) {
      r.s.step(1); const s = r.snap();
      if (s.world.turn) { expect([1, 3]).toContain(s.frames.cur.biome); turnedIso = true; }
      maxRate = Math.max(maxRate, Math.abs(s.world.turn));
      if (i % 15) continue;
      for (const e of s.enemies) if (e.ground && e.hp > 0) {
        // World position recovered from the flight frame must not drift.
        const ahead = 84 - e.y, fx = -Math.sin(s.world.h), fz = -Math.cos(s.world.h), rx = Math.cos(s.world.h), rz = -Math.sin(s.world.h);
        const w = { x: s.world.x + rx * e.x + fx * ahead, z: s.world.z + rz * e.x + fz * ahead }, prev = tracked.get(e.id);
        if (prev) expect(Math.hypot(prev.x - w.x, prev.z - w.z)).toBeLessThan(0.01); else tracked.set(e.id, w);
      }
    }
    expect(turnedIso).toBe(true); expect(maxRate).toBeLessThan(0.1); expect(Number(r.s.sim.summary().absorbed)).toBe(0);
  }, 30_000);
  it('new arsenal tiers unfold on bar lines', () => {
    const tl = longMusic(), r = rig({}, 'z2', tl); r.s.tuning.set('starfighter.arsenalPace', 10); const ups: number[] = [];
    r.s.ctx.emit = ((ev: { type: string }) => { if (ev.type === 'gunUpgrade') ups.push(r.s.ctx.media!.positionS()); }) as typeof r.s.ctx.emit;
    r.seconds(240);
    expect(ups.length).toBe(4); for (const u of ups) expect(tl.downbeats.some(d => Math.abs(d - u) < 0.04) || tl.phrases.some(d => Math.abs(d - u) < 0.04)).toBe(true);
  });
  it('locks tick on sixteenths, volleys release on beats, and laser impacts land on beats', () => {
    const tl = longMusic(), r = rig({}, 'z2', tl); const volleys: number[] = [], locks: number[] = [], impacts: number[] = []; const seen = new Set<number>();
    r.s.ctx.emit = ((ev: { type: string }) => { const p = r.s.ctx.media!.positionS(); if (ev.type === 'lockVolley') volleys.push(p); if (ev.type === 'lockAcquired') locks.push(p); }) as typeof r.s.ctx.emit;
    for (let i = 0; i < 30 * 180; i++) { r.s.step(1); for (const l of r.snap().lasers) if (l.hit && !seen.has(l.id)) { seen.add(l.id); impacts.push(r.s.ctx.media!.positionS()); } }
    const sixteenths = tl.beats.flatMap((b, i) => { const n = tl.beats[i + 1] ?? b + 0.5; return [0, 1, 2, 3].map(k => b + (n - b) * k / 4); });
    const on = (xs: number[], grid: number[]) => xs.filter(x => grid.some(g => Math.abs(g - x) < 0.04)).length / xs.length;
    expect(volleys.length).toBeGreaterThan(20); expect(on(volleys, tl.beats)).toBeGreaterThan(0.9);
    expect(on(impacts, tl.beats)).toBeGreaterThan(0.9); expect(on(locks, sixteenths)).toBeGreaterThan(0.9);
  }, 15_000);
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
  it('new riders start with only the Cruiser; Escort unlocks at Cruiser level 3, persists once, and retains selected craft', () => {
    const fresh = rig(); expect(fresh.snap().crafts.escort.unlocked).toBe(false); expect(fresh.snap().crafts.cruiser.level).toBe(1);
    const nearly = migrateSave({ v: 3, best: 0, legacyBest: 0, runs: 1, onTargetS: 89 * 60, unlockCredit: 0, craft: 'cruiser', totals: { kills: 0, bosses: 0 }, craftS: { cruiser: 89 * 60, escort: 0 }, unlocked: ['cruiser'] });
    expect(escortAvailable(nearly)).toBe(false);
    const r = rig({}, 'z2', undefined, nearly as unknown as Record<string, unknown>); const events: string[] = [];
    r.s.ctx.emit = ((ev: { type: string }) => { events.push(ev.type); }) as typeof r.s.ctx.emit;
    r.seconds(90); expect(r.snap().crafts.cruiser.level).toBe(3); expect(events).toContain('craftLevel'); expect(r.snap().wingmen).toBe(1);
    r.s.sim.dispose!(); expect(escortAvailable(r.saved())).toBe(true); expect(r.saved().unlocked).toContain('escort');
    const before = r.saved().craftS.cruiser; r.s.sim.dispose!(); expect(r.saved().craftS.cruiser).toBe(before);
    const next = rig({ craft: 'escort' }, 'z2', undefined, r.saved() as unknown as Record<string, unknown>);
    expect(next.snap().craft).toBe('escort'); expect(next.saved().runs).toBe(3);
  });
  it('craft levels add companions and arsenal ceiling, never raw damage; tester mode unlocks everything', () => {
    expect(craftLevel(0).level).toBe(1); expect(craftLevel(45 * 60).level).toBe(2); expect(craftLevel(630 * 60)).toMatchObject({ level: 10, nextAtS: null });
    expect(perks('cruiser', 1)).toMatchObject({ arsenalCap: 5, wingmen: 0, heavy: false });
    expect(perks('cruiser', 10)).toMatchObject({ arsenalCap: 8, wingmen: 2, heavy: true, ace: true });
    expect(perks('escort', 1).wingmen).toBe(2);
    expect(arsenalTier(60 * 60, 5)).toBe(5); expect(arsenalTier(60 * 60, 8)).toBe(8); expect(arsenalTier(5 * 60, 8)).toBe(2);
    const t = rig({ craft: 'escort', skipHangar: false }); t.s.tuning.set('starfighter.testerUnlockAll', 1); t.s.step(1);
    expect(t.snap()).toMatchObject({ tester: true, escortUnlocked: true }); expect(t.snap().crafts.cruiser.level).toBe(10);
    t.s.tuning.set('starfighter.arsenalPace', 20); t.s.sim.receive!({ type: 'launch' }); t.seconds(200);
    expect(t.snap().gunLevel).toBe(8); expect(t.snap().heavy).toBe(true); expect(t.snap().lockCapacity).toBe(11);
  });
  it('Escort signatures: wingmen shoot down bullets and a phrase beam sweeps the lane', () => {
    const r = rig({ craft: 'escort' }, 'z2', longMusic(), { bank: 1000 }); const events: string[] = [];
    r.s.ctx.emit = ((ev: { type: string }) => { events.push(ev.type); }) as typeof r.s.ctx.emit; r.seconds(240);
    expect(r.snap().eaten).toBeGreaterThan(20); expect(events.filter(e => e === 'beam').length).toBeGreaterThan(5);
    expect(events).not.toContain('fullLock');
    const c = rig({}, 'z2', longMusic()); const ce: string[] = [];
    c.s.ctx.emit = ((ev: { type: string }) => { ce.push(ev.type); }) as typeof c.s.ctx.emit; c.seconds(240);
    expect(ce).toContain('fullLock'); expect(c.snap().eaten).toBe(0);
  }, 15_000);
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
