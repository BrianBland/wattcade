import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NullInput, createGameSession, testProfile } from '../../../core';
import { module } from '../index';
import { KINDS, type Kind } from '../sim/defs';
import type { EnemyView, Fx, TdSnapshot } from '../sim/types';
import { apply, buildRig, explicitPair, flap, matrices, pose, thud, type AlienManifest } from '../render/aliens/rig';
import { SPECIES, SPECIES_LIST, SPECIES_OF_KIND, alienLengthUnits } from '../render/aliens/species';
import { STRIKE_FROM, advanceTrack, newTrack } from '../render/aliens/track';

const manifest = (id: string) => JSON.parse(readFileSync(join(process.cwd(), 'public', 'td', 'aliens', id, 'manifest.json'), 'utf8')) as AlienManifest;
const rigOf = (id: string) => buildRig(manifest(id));

describe('alien species', () => {
  it('every sim kind has a puppet, and sizes follow the shared radius rule', () => {
    for (const kind of Object.keys(KINDS) as Kind[]) expect(SPECIES_OF_KIND[kind]).toBeDefined();
    expect(alienLengthUnits(KINDS.brute.radius, SPECIES.warrior)).toBeCloseTo(2.7 * 2.6 * 1.25);
    expect(alienLengthUnits(KINDS.mini.radius, SPECIES.skitter)).toBeCloseTo(1.4 * 2.6 * 1.25 * 1.3);
  });
  it('packed manifests reference every part file', () => {
    for (const s of SPECIES_LIST) {
      const m = manifest(s.id);
      expect(m.parts.length).toBeGreaterThan(10);
      for (const p of m.parts) { expect(p.file).toMatch(/\.webp$/); expect(p.w).toBeGreaterThan(0); expect(p.h).toBeGreaterThan(0); }
    }
  });
});

describe('rig: leg chains and mirroring', () => {
  it('finds walking legs front to rear, as three-section chains', () => {
    const w = rigOf('warrior');
    expect(w.walking.map((l) => l.group)).toEqual(['front', 'mid', 'rear']);
    for (const l of w.walking) expect(l.chain.map((n) => n.split('_')[0])).toEqual(['coxa', 'femur', 'claw']);
    expect(rigOf('skitter').walking).toHaveLength(4);
    const b = rigOf('bulwark');
    expect(b.walking.length).toBeGreaterThanOrEqual(4);
    for (const l of b.walking) expect(l.chain.map((n) => n.split('_')[0])).toEqual(['socket', 'foot']);
  });
  it('special limbs: scythe arms, hanging legs, dorsal tubes', () => {
    expect(rigOf('tyrant').special.map((l) => l.group)).toContain('scythe_arm');
    expect(rigOf('glider').special.map((l) => l.group)).toContain('hanging');
    expect(rigOf('stalker').special.map((l) => l.group)).toContain('dorsal');
  });
  it('an explicit _l part is drawn as-is, never also mirrored (the Glider wings)', () => {
    const g = rigOf('glider');
    expect(explicitPair(g.parts, 'wing_r')).toBe(true);
    expect(g.order).toContain('wing_r');
    expect(g.order).toContain('wing_l');
    expect(g.order.some((k) => k.startsWith('wing_r#'))).toBe(false);
  });
  it('left instances mirror the right about the centre line at rest', () => {
    const r = rigOf('warrior'), M = matrices(r, new Map());
    const p = r.parts.get('claw_front_r')!.pivot;
    const [lx, ly] = apply(M.get('claw_front_r#l')!, p[0], p[1]), [rx, ry] = apply(M.get('claw_front_r#r')!, p[0], p[1]);
    expect(lx).toBeCloseTo(2 * r.m.centerX - rx, 3);
    expect(ly).toBeCloseTo(ry, 3);
  });
});

describe('rig: gaits', () => {
  it('the thud gait is continuous and its legs only move forward', () => {
    let prev = thud(0), maxJump = 0;
    for (let c = 0.0005; c < 2; c += 0.0005) {
      const cur = thud(c);
      const dph = cur.ph - prev.ph + (cur.ph < prev.ph - 0.5 ? 1 : 0);
      expect(dph).toBeGreaterThanOrEqual(-1e-9);
      maxJump = Math.max(maxJump, Math.abs(cur.sway - prev.sway));
      prev = cur;
    }
    expect(maxJump).toBeLessThan(0.05);
  });
  it('the glider wingbeat loop has no snaps, including the wrap', () => {
    const s = SPECIES.glider;
    let prev = flap(s, 0), max = 0;
    for (let p = 0.001; p <= 1; p += 0.001) { const f = flap(s, p); max = Math.max(max, Math.abs(f - prev)); prev = f; }
    expect(max).toBeLessThan(0.06);
    expect(Math.abs(flap(s, 0.99999) - flap(s, 0))).toBeLessThan(0.02);
  });
  it('a strike raises the front legs; death curls the claws', () => {
    const r = rigOf('warrior'), s = SPECIES.warrior;
    expect(pose(r, s, { phase: 0, attack: 1 }).get('coxa_front_r')!.deg).toBeLessThan(pose(r, s, { phase: 0 }).get('coxa_front_r')!.deg);
    expect(pose(r, s, { phase: 0, dying: 1 }).get('claw_mid_r')!.deg).toBeGreaterThan(40);
  });
});

const view = (over: Partial<EnemyView>): EnemyView => ({
  id: 7, kind: 'brute', route: -1, flying: false, x: 20, y: 20, angle: 0, dist: 50, radius: KINDS.brute.radius, element: 'red', gold: false,
  hp: 10, maxHp: 10, hurt: 0, charging: false, shiftIn: 0, next: null, progress: 0.3, bossPhase: 0, telegraph: false, exposed: false, staggerS: 0, ...over,
});

describe('track: gait follows the sim', () => {
  it('walkers cover `stride` of their body length per gait cycle, so feet stay planted', () => {
    const s = SPECIES.warrior, len = alienLengthUnits(KINDS.brute.radius, s), tr = newTrack(view({}));
    const c0 = tr.cycles;
    for (let i = 1; i <= 30; i++) advanceTrack(tr, view({ y: 20 + i * 0.2 }), s, len, i / 30, 1 / 30);
    expect(tr.cycles - c0).toBeCloseTo(6 / (s.stride * len), 6);
  });
  it('spawns and resets (teleports) do not spin the legs', () => {
    const s = SPECIES.warrior, len = alienLengthUnits(KINDS.brute.radius, s), tr = newTrack(view({}));
    const c0 = tr.cycles;
    advanceTrack(tr, view({ x: 80, y: 80 }), s, len, 0.1, 0.1);
    expect(tr.cycles).toBe(c0);
  });
  it('fliers beat on a clock; walkers rear up near the base', () => {
    const tr = newTrack(view({ kind: 'dart' }));
    advanceTrack(tr, view({ kind: 'dart' }), SPECIES.glider, 3, 2, 1 / 30);
    const a = tr.cycles;
    advanceTrack(tr, view({ kind: 'dart' }), SPECIES.glider, 3, 3, 1 / 30);
    expect(tr.cycles).toBeGreaterThan(a);
    const w = newTrack(view({}));
    for (let i = 0; i < 30; i++) advanceTrack(w, view({ progress: STRIKE_FROM + 0.01 }), SPECIES.warrior, 9, i / 30, 1 / 30);
    expect(w.attack).toBeGreaterThan(0.9);
  });
});

describe('sim: death fx name the alien', () => {
  it('death fx carry the alien id and kind, and fire kills of reds are flagged', () => {
    const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'sprints' }, seed: 3, simOpts: { autopilot: true } });
    const deaths: Array<Extract<Fx, { kind: 'death' }>> = [];
    const seen = new Set<number>();
    for (let i = 0; i < 30 * 600 && !(deaths.length > 40 && deaths.some((d) => d.fire && d.color === 'red')); i++) {
      s.step(1);
      for (const f of (s.sim.snapshot() as TdSnapshot).fx) if (f.kind === 'death' && !seen.has(f.id)) { seen.add(f.id); deaths.push(f); }
    }
    expect(deaths.length).toBeGreaterThan(5);
    for (const d of deaths) { expect(d.eid).toBeGreaterThan(0); expect(Object.keys(KINDS)).toContain(d.ekind); }
    expect(deaths.some((d) => d.fire && d.color === 'red')).toBe(true); // a Flamer wave burns reds
  });
});
