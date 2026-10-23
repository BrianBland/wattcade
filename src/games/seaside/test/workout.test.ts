import { describe, expect, it } from 'vitest';
import { effortAt } from '../sim/graph';
import { STORY } from '../sim/story';
import type { Scene, TrainerPlan } from '../sim/types';
import { cadenceRate, gradeAt, pullLevel, sceneCommand, WORKOUT_DEFAULTS as W, type TrainerState } from '../sim/workout';

const startEffort = (sc: Scene) => effortAt(sc, 0);
const scene = (id: string) => STORY.find((s) => s.id === id)!;
const st = (sc: Scene, p: number, extra: Partial<TrainerState> = {}): TrainerState =>
  ({ p, planT: p * sc.planS, sceneT: p * sc.planS, crankRevs: p * sc.planS * 1.5, pull: null, released: false, ...extra });
const grades = (sc: Scene) => {
  const tr = sc.trainer as Extract<TrainerPlan, { mode: 'sim' }>;
  return Array.from({ length: 201 }, (_, i) => gradeAt(tr, i / 200));
};

describe('workout: trainer plan per scene', () => {
  it('rides follow the route profile: Highway ±2 %, rollers to +4 %, the cavern descends −3 to −5 %', () => {
    const hw = grades(scene('highway'));
    expect(Math.max(...hw)).toBeGreaterThan(1.5); expect(Math.max(...hw)).toBeLessThanOrEqual(2);
    expect(Math.min(...hw)).toBeLessThan(-0.5); expect(Math.min(...hw)).toBeGreaterThanOrEqual(-1);
    expect(Math.max(...grades(scene('rollers')))).toBeCloseTo(4);
    const cav = grades(scene('cavern'));
    expect(cav[0]).toBe(0);
    expect(Math.min(...cav)).toBeCloseTo(-5);
    expect(cav.slice(110).every((g) => g <= -3 && g >= -5)).toBe(true);
    for (const sc of STORY.filter((s) => s.kind === 'ride' && s.trainer.mode === 'sim')) {
      for (const g of grades(sc)) { expect(g, sc.id).toBeLessThanOrEqual(4); expect(g, sc.id).toBeGreaterThanOrEqual(-5); }
    }
  });
  it('keeps one trainer mode per scene whatever the state', () => {
    for (const sc of STORY) {
      const modes = new Set<string>();
      for (let i = 0; i <= 20; i++) {
        const p = i / 20;
        for (const extra of [{}, { released: true }, { pull: { size: 1, t: 3, durS: 25, setPiece: false } }])
          modes.add(sceneCommand(sc, st(sc, p, extra), W)?.mode ?? 'none');
      }
      expect(modes.size, sc.id).toBe(1);
    }
  });
  it('drills are ERG at Z3 following the plan, with chip-clearing rests', () => {
    const d = scene('drill1');
    const ftps = Array.from({ length: 100 }, (_, i) => sceneCommand(d, st(d, i / 100), W)!.ftpFraction!);
    expect(Math.max(...ftps)).toBeCloseTo(0.86);
    expect(Math.min(...ftps)).toBeCloseTo(0.6);
    expect(ftps.filter((f) => f >= 0.76).length).toBeGreaterThan(60);
    expect(sceneCommand(d, st(d, 0.3), { ...W, drillScale: 0.9 })!.ftpFraction).toBeCloseTo(effortAt(d, 0.3 * d.planS) * 0.9);
  });
  it('fishing surges while the fish runs, scaled by size, and drops back after', () => {
    const f = scene('pier');
    const base = sceneCommand(f, st(f, 0.1), W)!.levelPct!;
    expect(base).toBe(30);
    const small = sceneCommand(f, st(f, 0.33, { pull: { size: 0, t: 0.5, durS: 6, setPiece: false } }), W)!.levelPct!;
    const big = sceneCommand(f, st(f, 0.33, { pull: { size: 1, t: 0.5, durS: 25, setPiece: false } }), W)!.levelPct!;
    expect(small).toBe(W.pullLevelMin);
    expect(big).toBe(W.pullLevelMax);
    const rest = pullLevel(base, { size: 0, t: W.runPeriodS * 0.8, durS: 6, setPiece: false }, W);
    expect(rest).toBeLessThan(small);
    expect(rest).toBeGreaterThanOrEqual(50); // still a surge: scenarios count sprints as runs ≥ 50 %
  });
  it('set pieces ramp up through the sprint and let go after it', () => {
    const b = scene('bigOne');
    const at = (t: number) => sceneCommand(b, st(b, 0.55, { pull: { size: 1, t, durS: 25, setPiece: true } }), W)!.levelPct!;
    expect(at(0)).toBe(30);
    expect(at(25)).toBe(W.pullLevelMax);
    expect(sceneCommand(b, st(b, 0.8, { released: true }), W)!.levelPct).toBe(W.releasePct);
  });
  it('paddling and flapping pulse rhythmically', () => {
    const pd = scene('paddle'), wg = scene('wings');
    const pg = Array.from({ length: 30 }, (_, i) => sceneCommand(pd, st(pd, 0.5, { sceneT: i * 0.25 }), W)!.gradePct!);
    expect(new Set(pg)).toEqual(new Set([0, W.paddlePct]));
    const wl = Array.from({ length: 30 }, (_, i) => sceneCommand(wg, st(wg, 0.5, { crankRevs: i * 0.25 }), W)!.levelPct!);
    expect(new Set(wl)).toEqual(new Set([30, 30 + W.flapPct]));
  });
  it('cutscenes are soft or off', () => {
    for (const sc of STORY.filter((s) => s.kind === 'cutscene' && s.pulls.length === 0)) {
      const c = sceneCommand(sc, st(sc, 0.5), W);
      expect(c === null || (c.mode === 'sim' && Math.abs(c.gradePct!) <= 0.5), sc.id).toBe(true);
    }
  });
  it('each chapter opens soft and ends on a quiet beat', () => {
    for (const ch of [0, 1, 2]) {
      const scs = STORY.filter((s) => s.chapter === ch);
      for (const [sc, p] of [[scs[0], 0], [scs[1], 0], [scs[scs.length - 1], 0.5]] as const) {
        const c = sceneCommand(sc, st(sc, p), W);
        expect(c === null || (c.mode === 'sim' && Math.abs(c.gradePct!) <= 0.5), `${sc.id} trainer`).toBe(true);
      }
      for (const sc of [scs[0], scs[scs.length - 1]]) expect(startEffort(sc), `${sc.id} effort`).toBeLessThanOrEqual(0.6);
    }
  });
  it('cadence bands: a drill bonus inside 60–75 rpm, a fan crawl outside its band', () => {
    expect(cadenceRate(scene('drill1'), 68, W)).toBeCloseTo(1 + W.drillBandBonus);
    expect(cadenceRate(scene('drill1'), 90, W)).toBe(1);
    expect(cadenceRate(scene('fan'), 90, W)).toBe(1);
    expect(cadenceRate(scene('fan'), 50, W)).toBe(W.fanOffBand);
    expect(cadenceRate(scene('highway'), 50, W)).toBe(1);
  });
});
