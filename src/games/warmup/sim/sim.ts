import type { GameContext, GameHud, GameSim, Seconds } from '../../../contracts';
import { BIOMES, biomeAt, makeTerrain, type BiomeId, type Terrain } from './terrain';

export interface WarmupOpts {
  seed?: number;
  /** Continue from this road distance (m) so a restarted lobby session doesn't jump the scenery. */
  startDistance?: number;
  /** Biome loop start index (otherwise picked from ctx.rng). */
  startBiome?: number;
  /** Terrain seed (otherwise picked from ctx.rng). */
  terrainSeed?: number;
  /** Start with the Drive-In biome fully on (the shell passes it on restart so the scene doesn't flip). */
  driveIn?: boolean;
}

/** `receive()` actions. */
export type WarmupAction = { type: 'driveIn'; on: boolean };

export interface WarmupSnapshot {
  t: number;
  d: number;            // road distance, m (absolute; startDistance + ridden)
  v: number;            // m/s
  grade: number;        // % actually under the wheels (and sent to the trainer)
  hill: number;         // 0..1 hills fade (0 = flat road)
  hillsOn: boolean;
  maxGrade: number; exaggeration: number; biomeM: number; blendM: number;
  terrainSeed: number; startBiome: number;
  /** The biome you are in (flips at the gateway), the one after it, and the pair being blended right now. */
  biome: BiomeId; nextBiome: BiomeId; from: BiomeId; to: BiomeId; mix: number; toNextM: number;
  /** 0..1 blend into the Drive-In biome (a lobby mode, not in the loop) and whether it is switched on. */
  driveIn: number; driveInOn: boolean;
  rodeM: number; climbM: number; topKph: number;
  hooks: Record<string, unknown>;
}

const G = 9.81, RHO = 1.2, DRIVE_EFF = 0.975, MAX_V = 22;

/** Free ride behind the menus: power moves you along a seeded rolling road through looping biomes. Never ends. */
export function createWarmupSim(ctx: GameContext, opts: WarmupOpts = {}): GameSim & { snapshot(): WarmupSnapshot } {
  const tun = {
    hills: ctx.tuning.bool('hills', true, 'Rolling hills: trainer grade follows the road (off = flat road)'),
    maxGrade: ctx.tuning.num('maxGrade', 3, 0, 8, 0.5, 'Steepest road grade %, sent to the trainer in sim mode'),
    exaggeration: ctx.tuning.num('exaggeration', 4, 1, 12, 0.5, 'How much taller hills are drawn than the trainer grade'),
    biomeKm: ctx.tuning.num('biomeKm', 1.2, 0.3, 10, 0.1, 'Road length of each biome'),
    cda: ctx.tuning.num('cda', 0.32, 0.15, 0.6, 0.01, 'Rider drag area for the on-screen speed (m²)'),
    crr: ctx.tuning.num('crr', 0.005, 0.001, 0.02, 0.001, 'Rolling resistance for the on-screen speed'),
    hillFadeS: ctx.tuning.num('hillFadeS', 3, 0.5, 15, 0.5, 'Seconds to flatten/raise the road when hills are toggled'),
    blendM: ctx.tuning.num('blendM', 300, 60, 800, 20, 'Meters over which one biome cross-dissolves into the next (centered on the gateway)'),
    driveInS: ctx.tuning.num('driveInS', 8, 1, 30, 1, 'Seconds to blend into / out of the Drive-In biome'),
  };
  const terrainSeed = opts.terrainSeed ?? Math.floor(ctx.rng() * 1e9);
  const startBiome = opts.startBiome ?? Math.floor(ctx.rng() * BIOMES.length);
  const d0 = opts.startDistance ?? 0;
  let maxGrade = tun.maxGrade();
  let terrain: Terrain = makeTerrain(terrainSeed, maxGrade);
  let driveInOn = !!opts.driveIn, driveIn = driveInOn ? 1 : 0;
  const at = (dd: number) => biomeAt(dd, tun.biomeKm() * 1000, startBiome, tun.blendM());
  let d = d0, v = 0, hill = tun.hills() ? 1 : 0, grade = 0, climb = 0, top = 0;
  let lastBiomeSeg = at(d).index;
  const visited = new Set<BiomeId>([at(d).dom]);
  ctx.resistance.useVirtualGears(true);

  const sim = {
    update(dt: Seconds) {
      if (tun.maxGrade() !== maxGrade) { maxGrade = tun.maxGrade(); terrain = makeTerrain(terrainSeed, maxGrade); }
      const target = tun.hills() ? 1 : 0;
      const step = dt / tun.hillFadeS();
      hill = target > hill ? Math.min(target, hill + step) : Math.max(target, hill - step);
      grade = hill > 0 ? hill * terrain.grade(d) : 0;
      ctx.resistance.set({ id: 'terrain', mode: 'sim', gradePct: +grade.toFixed(1) });

      const bike = ctx.bike();
      const m = ctx.profile.weightKg + 9;
      const th = Math.atan(grade / 100);
      const drive = (Math.max(0, bike.raw.power) * DRIVE_EFF) / Math.max(v, 1);
      const resist = m * G * (tun.crr() * Math.cos(th) + Math.sin(th)) + 0.5 * RHO * tun.cda() * v * v;
      v = Math.min(MAX_V, Math.max(0, v + ((drive - resist) / m) * dt));
      if (v < 0.05 && bike.raw.power <= 0) v = 0;
      const dd = v * dt;
      d += dd;
      if (grade > 0) climb += (dd * grade) / 100;
      top = Math.max(top, v);

      const dStep = dt / tun.driveInS();
      driveIn = driveInOn ? Math.min(1, driveIn + dStep) : Math.max(0, driveIn - dStep);

      const b = at(d);
      if (b.index !== lastBiomeSeg) {
        lastBiomeSeg = b.index; visited.add(b.dom);
        ctx.emit({ type: 'biomeReached', data: { biome: b.dom } });
      }
      ctx.debug('warmup.grade', +grade.toFixed(2)); ctx.debug('warmup.kph', +(v * 3.6).toFixed(1)); ctx.debug('warmup.biome', b.dom);
      if (driveIn > 0) ctx.debug('warmup.driveIn', +driveIn.toFixed(2));
    },
    hud(): GameHud {
      return {
        targetZone: { min: 1, max: 2, label: 'Warm-up' },
        gears: true,
        controls: [{ button: 'dpad', label: 'Move' }, { button: 'a', label: 'Select' }, { button: 'b', label: 'Back' }],
      };
    },
    snapshot(): WarmupSnapshot {
      const biomeM = tun.biomeKm() * 1000;
      const b = at(d);
      return {
        t: ctx.clock.now(), d, v, grade, hill, hillsOn: tun.hills(),
        maxGrade, exaggeration: tun.exaggeration(), biomeM, blendM: tun.blendM(), terrainSeed, startBiome,
        biome: b.dom, nextBiome: biomeAt(d + b.toNextM + 1, biomeM, startBiome, 1).dom, from: b.cur, to: b.next, mix: b.mix, toNextM: b.toNextM,
        driveIn, driveInOn,
        rodeM: d - d0, climbM: climb, topKph: top * 3.6, hooks: {},
      };
    },
    receive(action: unknown) {
      const a = action as WarmupAction;
      if (a?.type === 'driveIn') driveInOn = !!a.on;
    },
    isOver: () => false,
    summary() {
      const t = Math.max(1, ctx.clock.now());
      return {
        distanceKm: +((d - d0) / 1000).toFixed(2), climbM: Math.round(climb),
        avgKph: +(((d - d0) / t) * 3.6).toFixed(1), topKph: +(top * 3.6).toFixed(1), biomes: visited.size,
      };
    },
    dispose() { ctx.resistance.clear('terrain'); },
  };
  return sim;
}
