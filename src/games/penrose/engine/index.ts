// @ts-nocheck
/*
 * Penrose Pedals engine entry. The engine is the design prototype's level player and level generators, split into
 * modules that share one scope object E: each module's install(E) takes the names it uses from E and adds its own.
 * Install order matters (a module sees only what earlier modules added; the few calls into later modules are lazy).
 * Coordinates: sketch (x, y = depth, z = up) → three.js (x, z, y). See ../NOTES.md.
 */
import type { EngineDom, EngineHooks, PenroseEngine } from '../render/engineTypes';
import { CAMPAIGN } from '../campaign';
import { install as core } from './core';
import { install as machines } from './machines';
import { install as levels } from './levels';
import { install as studies } from './studies';
import { install as gen9 } from './gen9';
import { install as persp } from './persp';
import { install as machines2 } from './machines2';
import { install as combos } from './combos';
import { install as gravity } from './gravity';
import { install as gravity2 } from './gravity2';
import { install as curtain } from './curtain';
import { install as audit } from './audit';

/** Hand-built level defs, by id, from every module that has them. */
const handBuilt = (E) => {
  const pool = {};
  for (const d of [...E.HAND_LEVELS, ...E.STUDIES, ...E.PSTUDIES, ...E.MSTUDIES, ...E.CSTUDIES, ...E.GSTUDIES, ...E.G2STUDIES]) pool[d.id] = d;
  return pool;
};

/** A level def for one campaign item ('id', '<tier>:<seed>' or 'cg:<seed>'), or null when the seed doesn't plan. */
function defFor(E, pool, item) {
  if (pool[item]) return pool[item];
  if (item.startsWith('cg:')) { const pl = E.curtainPlan(+item.slice(3)); return pl ? E.curtainDef(pl) : null; }
  const [ti, sd] = item.split(':').map(Number);
  if (!Number.isFinite(ti) || !Number.isFinite(sd)) return null;
  const r = E.penroseGen9.plan3For(ti, sd);
  return r.plan ? E.genDef3(r.plan, r.sol) : null;
}

export function createPenroseEngine(dom: EngineDom, hooks: EngineHooks, campaign = CAMPAIGN): PenroseEngine {
  const E = { dom, hooks };
  for (const install of [core, machines, levels, studies, gen9, persp, machines2, combos, gravity, gravity2, curtain, audit]) install(E);
  const pool = handBuilt(E), LEVELS = E.LEVELS;
  for (const ch of campaign) for (const it of ch.levels) {
    const d = defFor(E, pool, it);
    if (d) LEVELS.push(Object.assign(Object.create(d), { chapter: ch.name, item: it }));
  }
  const st = () => E.state();
  const wrap = (i) => ((i % LEVELS.length) + LEVELS.length) % LEVELS.length;
  const machineFor = (key) => st().LVL && st().LVL.machines.find((m) => m.key === key);
  return {
    get levels() { return LEVELS.map((d) => ({ id: d.id, name: d.name, chapter: d.chapter, item: d.item })); },
    get index() { return st().lvIndex; },
    get level() { return st().LVL; },
    get autopilot() { return st().autopilot; },
    rider: E.rider,
    load(i, quiet) { E.setAutopilot(false); E.loadLevel(wrap(i), quiet); },
    restart() { E.setAutopilot(false); E.loadLevel(st().lvIndex, true); },
    setAutopilot: E.setAutopilot,
    toggle(key) { const m = machineFor(key); if (!m) return false; E.setAutopilot(false); m.set(!m.on); return true; },
    machines() { const L = st().LVL; return L ? L.machines.map((m) => ({ key: m.key, name: m.name, on: m.on })) : []; },
    load01() { const L = st().LVL; return L ? Math.min(1.5, L.load || 0) / 1.5 : 0; },
    resize() { E.lvView.resize(); },
    tick(dt) { E.lvView.tick(E.reduce ? dt * 0.5 : dt); },
    simulate(dt) { const v = E.lvView; v.t += dt; for (const u of v.updaters.slice()) u(v.t, dt); },
    dispose() {
      E.lvView.clear(); E.R3.dispose(); E.R3.forceContextLoss(); E.R3.domElement.remove();
      for (const t of [...Object.values(E.TEX), ...Object.values(E.TEXS)]) t.dispose();
    },
    tools: {
      tiers: () => E.TIERS.map((t, i) => ({ index: i, id: t.id, label: t.label, zone: t.zone })),
      candidates: (tier, seeds) => E.candidates3(tier, seeds),
      plan: (tier, seed) => E.penroseGen9.plan3For(tier, seed),
      curtainPlan: (seed) => E.curtainPlan(seed),
      handBuilt: () => Object.keys(pool),
      /** Append a level that isn't in the campaign (any campaign item string) and open it; returns its index or -1. */
      preview(item) { const d = defFor(E, pool, item); if (!d) return -1; LEVELS.push(Object.assign(Object.create(d), { chapter: 'Preview', item })); E.setAutopilot(false); E.loadLevel(LEVELS.length - 1); return LEVELS.length - 1; },
      audit: (o) => (st().LVL ? E.auditLevel(st().LVL, o) : []),
    },
  };
}
