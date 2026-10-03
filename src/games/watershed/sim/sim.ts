import type { GameContext, GameHud, GameSim, Seconds } from '../../../contracts';
import { bandMid, PLAN, PLAN_MINUTES, planAt, type Style } from './plan';
import type { WatershedSave } from '../card';
import { makeTerrain, NX, type Terrain } from './terrain';
import { DEFAULT_WATER, Water, type Emit, type WaterParams } from './water';

export interface WatershedOpts { seed?: number; autopilot?: boolean; terrainSeed?: number }

export interface WatershedSnapshot {
  t: number; over: boolean;
  nx: number; ny: number; coastY: number; ridges: number[];
  /** Live grids (shared, not copied): heights, start heights, erodibility, water depth. */
  h: Float32Array; h0: Float32Array; hard: Float32Array; w: Float32Array;
  /** Live particle arrays; only the first `n` entries are valid. */
  n: number; px: Float32Array; py: Float32Array; pvx: Float32Array; pvy: Float32Array; pvol: Float32Array; psed: Float32Array;
  version: number;
  sourceX: number;
  block: { index: number; name: string; hint: string; style: Style; left: number; ftp: number; rpm?: { min: number; max?: number } };
  blocks: Array<{ name: string; style: Style; minutes: number }>;
  rideS: number;
  cadence: number; cadNorm: number; rpmLow: number; rpmHigh: number; dropVol: number; inBand: boolean; bandBonus: number;
  carved: number; delta: number; deepestCut: number; toSea: number; bandS: number;
  hooks: { cadence: number };
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function createWatershedSim(ctx: GameContext, opts: WatershedOpts = {}): GameSim & { snapshot(): WatershedSnapshot } {
  const tn = ctx.tuning;
  const tun = {
    planScale: tn.num('planScale', 1, 0.1, 2, 0.05, 'Multiply every block length (1 = the 45 min ride)'),
    flowPerFtp: tn.num('flowPerFtp', 16, 2, 60, 1, 'Water volume per second at 1.0 FTP'),
    volHeavy: tn.num('volHeavy', 0.6, 0.1, 2, 0.02, 'Parcel volume at low cadence (heavy, carving)'),
    volLight: tn.num('volLight', 0.2, 0.05, 1, 0.01, 'Parcel volume at high cadence (light, fast)'),
    rpmLow: tn.num('rpmLow', 60, 30, 90, 1, 'Cadence that gives the heaviest water'),
    rpmHigh: tn.num('rpmHigh', 110, 80, 140, 1, 'Cadence that gives the lightest, fastest water'),
    speedLow: tn.num('speedLow', 2, 0, 10, 0.5, 'Spring outflow speed at rpmLow (cells/s)'),
    speedHigh: tn.num('speedHigh', 9, 1, 15, 0.5, 'Spring outflow speed at rpmHigh (cells/s)'),
    bandBonus: tn.num('bandBonus', 0.6, 0, 2, 0.05, 'Extra erosion while cadence is in the block\'s band'),
    steerRate: tn.num('steerRate', 14, 2, 40, 1, 'D-pad spring steering speed (cells/s)'),
    shiftStep: tn.num('shiftStep', 4, 1, 12, 1, 'Spring move per shifter click (cells)'),
    gravity: tn.num('gravity', DEFAULT_WATER.gravity, 1, 60, 1, 'Water: accel per unit surface slope'),
    pressure: tn.num('pressure', DEFAULT_WATER.pressure, 0, 5, 0.05, 'Water: depth pushes water apart (pooling/spreading)'),
    friction: tn.num('friction', DEFAULT_WATER.friction, 0, 5, 0.05, 'Water: base drag'),
    shallowDrag: tn.num('shallowDrag', DEFAULT_WATER.shallowDrag, 0, 3, 0.05, 'Water: extra drag in thin water'),
    capacity: tn.num('capacity', DEFAULT_WATER.capacity, 0, 5, 0.05, 'Erosion: sediment carried per vol·speed·slope'),
    erode: tn.num('erode', DEFAULT_WATER.erode, 0, 5, 0.05, 'Erosion: pickup rate'),
    deposit: tn.num('deposit', DEFAULT_WATER.deposit, 0, 5, 0.05, 'Erosion: drop rate'),
    massExp: tn.num('massExp', DEFAULT_WATER.massExp, 0, 2, 0.05, 'Erosion: how much heavier parcels dig harder'),
    talus: tn.num('talus', DEFAULT_WATER.talus, 0.2, 4, 0.05, 'Banks: steepest soil step before it slumps'),
  };
  const params = (): WaterParams => ({
    ...DEFAULT_WATER,
    gravity: tun.gravity(), pressure: tun.pressure(), friction: tun.friction(), shallowDrag: tun.shallowDrag(),
    capacity: tun.capacity(), erode: tun.erode(), deposit: tun.deposit(), massExp: tun.massExp(), talus: tun.talus(),
  });

  const terrainSeed = opts.terrainSeed ?? Math.floor(ctx.rng() * 1e9);
  const terrain: Terrain = makeTerrain(terrainSeed);
  const water = new Water(terrain, ctx.rng);
  water.settle(params());
  const scale = tun.planScale();
  const rideS = PLAN_MINUTES * 60 * scale;

  let t = 0, sourceX = NX / 2, bandS = 0, bonus = 0, lastBlock = -1;
  let cadence = 0, cadNorm = 0.5, dropVol = 0.3, inBand = false;
  let carved = 0, delta = 0, deepestCut = 0, statAcc = 1;
  const cutMarks = [2, 4, 6, 8, 10], deltaMarks = [25, 50, 100, 200, 400];
  let cutIdx = 0, deltaIdx = 0, saved = false;

  ctx.resistance.useVirtualGears(false);

  const measure = () => {
    const { nx, ny, h, h0, coastY } = terrain;
    carved = 0; delta = 0; deepestCut = 0;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i, d = h0[k] - h[k];
      if (d > 0) { carved += d; if (j >= 10 && j < coastY && d > deepestCut) deepestCut = d; }
      else if (j >= coastY - 8) delta -= d;
    }
  };

  const sim = {
    update(dt: Seconds) {
      const at = planAt(t, scale);
      const b = at.block;
      if (at.index !== lastBlock) {
        lastBlock = at.index;
        ctx.emit({ type: 'blockStart', data: { name: b.name, style: b.style, index: at.index } });
      }
      ctx.resistance.set({ id: 'flow', mode: 'erg', ftpFraction: +at.ftp.toFixed(3) });

      const bike = ctx.bike(), input = ctx.input();
      cadence = bike.cadence3s;
      const lo = tun.rpmLow(), hi = tun.rpmHigh();
      cadNorm = clamp((cadence - lo) / Math.max(1, hi - lo), 0, 1);
      dropVol = tun.volHeavy() + (tun.volLight() - tun.volHeavy()) * cadNorm;
      inBand = !!b.rpm && cadence >= b.rpm.min && (b.rpm.max === undefined || cadence <= b.rpm.max);
      bonus += ((inBand ? 1 : 0) - bonus) * (1 - Math.exp(-dt / 1.5));
      if (inBand) bandS += dt;

      // steer the spring across the valley head
      if (opts.autopilot) sourceX = NX / 2 + 18 * Math.sin((2 * Math.PI * t) / 240);
      else {
        let dir = 0;
        if (input.held.has('up')) dir -= 1;
        if (input.held.has('down')) dir += 1;
        sourceX += dir * tun.steerRate() * dt;
        for (const p of input.pressed) {
          if (p === 'shiftUpL' || p === 'shiftUpR') sourceX -= tun.shiftStep();
          if (p === 'shiftDnL' || p === 'shiftDnR') sourceX += tun.shiftStep();
        }
      }
      sourceX = clamp(sourceX, 12, NX - 12);

      const flowing = cadence > 20 && !at.done;
      const emit: Emit = {
        flow: flowing ? tun.flowPerFtp() * clamp(bike.power3s / ctx.profile.ftp, 0, 2) : 0,
        dropVol,
        speed: tun.speedLow() + (tun.speedHigh() - tun.speedLow()) * cadNorm,
        sourceX, spread: 1 + 3 * cadNorm,
        erodeMul: 1 + tun.bandBonus() * bonus,
      };
      water.step(dt, emit, params());
      t += dt;

      statAcc += dt;
      if (statAcc >= 1) {
        statAcc = 0; measure();
        while (cutIdx < cutMarks.length && deepestCut >= cutMarks[cutIdx]) ctx.emit({ type: 'gorge', data: { depth: cutMarks[cutIdx++] } });
        while (deltaIdx < deltaMarks.length && delta >= deltaMarks[deltaIdx]) ctx.emit({ type: 'deltaGrew', data: { volume: deltaMarks[deltaIdx++] } });
      }
      if (!saved && t >= rideS) {
        saved = true; measure();
        const prev = ctx.load<WatershedSave>() ?? {};
        ctx.save({ rides: (prev.rides ?? 0) + 1, bestCarved: Math.max(prev.bestCarved ?? 0, Math.round(carved)), bestDelta: Math.max(prev.bestDelta ?? 0, Math.round(delta)) });
        ctx.emit({ type: 'rideDone', data: { carved: Math.round(carved), delta: Math.round(delta) } });
      }
      ctx.debug('watershed.block', b.name); ctx.debug('watershed.parcels', water.n);
      ctx.debug('watershed.dropVol', +dropVol.toFixed(2)); ctx.debug('watershed.inBand', inBand);
      ctx.debug('watershed.carved', Math.round(carved)); ctx.debug('watershed.delta', Math.round(delta));
    },
    hud(): GameHud {
      const b = planAt(t, scale).block;
      return {
        targetCadence: b.rpm ? { ...b.rpm, label: b.style === 'grind' ? 'Grind' : b.style === 'spin' ? 'Spin' : 'Steady' } : undefined,
        gears: false,
        controls: [{ button: 'dpad', label: 'Steer spring' }, { button: 'shiftersR', label: 'Nudge spring' }],
      };
    },
    snapshot(): WatershedSnapshot {
      const at = planAt(t, scale);
      return {
        t, over: t >= rideS,
        nx: terrain.nx, ny: terrain.ny, coastY: terrain.coastY, ridges: terrain.ridges,
        h: terrain.h, h0: terrain.h0, hard: terrain.hard, w: water.w,
        n: water.n, px: water.x, py: water.y, pvx: water.vx, pvy: water.vy, pvol: water.vol, psed: water.sed,
        version: water.version, sourceX,
        block: { index: at.index, name: at.block.name, hint: at.block.hint, style: at.block.style, left: at.blockLeft, ftp: at.ftp, rpm: at.block.rpm },
        blocks: PLAN.map((b) => ({ name: b.name, style: b.style, minutes: b.minutes * scale })),
        rideS, cadence, cadNorm, rpmLow: tun.rpmLow(), rpmHigh: tun.rpmHigh(), dropVol, inBand, bandBonus: bonus,
        carved, delta, deepestCut, toSea: water.stats.toSea, bandS,
        hooks: { cadence: bandMid(at.block) },
      };
    },
    isOver: () => t >= rideS,
    summary() {
      measure();
      const banded = PLAN.reduce((a, b) => a + (b.rpm ? b.minutes * 60 * scale : 0), 0);
      return {
        carved: Math.round(carved), delta: Math.round(delta), deepestCut: +deepestCut.toFixed(1),
        toSea: Math.round(water.stats.toSea), minutesInBand: +(bandS / 60).toFixed(1),
        bandPct: Math.round((100 * bandS) / Math.max(1, banded)), blocks: lastBlock + 1, parcels: water.stats.spawned,
      };
    },
    dispose() { ctx.resistance.clear('flow'); },
  };
  return sim;
}
