import type { GameContext, GameHud, GameSim, Seconds } from '../../../contracts';
import { bandMid, PLAN, PLAN_MINUTES, planAt, type Phase, type Style } from './plan';
import { DEFAULT_SKY, Sky, type Puff, type SunSpot } from './sky';
import type { WatershedSave } from '../card';
import { makeTerrain, NX, type Terrain } from './terrain';
import { DEFAULT_SALMON, SalmonRun, type Predator } from './salmon';
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
  phase: Phase;
  sky: SkyView;
  salmon: SalmonView | null;
  /** Recent one-shot cues for the renderer (sounds, popups); ids increase. */
  cues: Cue[];
  hooks: { cadence: number };
}

export interface SkyView {
  vapor: number; x: number; y: number; size: number; radius: number; seaY: number; inSun: boolean;
  sun: SunSpot[]; puffs: Puff[]; rained: number; raining: number; springX: number;
}
export interface Cue { id: number; type: string; data?: Record<string, number | string | boolean> }
export interface SalmonView {
  run: number; y: number; lane: number; home: number; lost: number; alive: number;
  /** Seconds left in this run's camera intro (school holds still), and its full length. */
  intro: number; introTotal: number;
  /** Upstream unit vector (grid) at the leader, and the river centreline every 4 rows (grid x, y). */
  heading: { x: number; y: number }; path: Array<[number, number]>;
  needLeap: boolean; leaping: boolean; stuck: boolean; restarting: boolean;
  leader: { x: number; y: number };
  fish: Array<{ x: number; y: number; alive: boolean }>;
  /** x = bear's bank / eagle's target (grid x); cx = channel centre at the predator's row. */
  predators: Array<Predator & { x: number; cx: number }>;
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
  const salmon = new SalmonRun(terrain, ctx.rng);
  const sky = new Sky(terrain.nx, terrain.ny, terrain.coastY, ctx.rng);
  let raining = 0;
  const cues: Cue[] = [];
  let cueId = 0;
  const cue = (type: string, data?: Cue['data'], emit = true) => {
    cues.push({ id: ++cueId, type, data });
    if (cues.length > 24) cues.shift();
    if (emit) ctx.emit({ type, data });
  };

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

  const bandedS = PLAN.reduce((a, b) => a + (b.rpm ? b.minutes * 60 * scale : 0), 0);
  /** The ride score: every phase of the cycle counts. */
  const score = () => Math.round(sky.vapor * 2 + sky.puffsCaught * 20 + sky.rained * 0.05 + carved / 10 + delta / 10
    + salmon.home * 20 + (100 * bandS / Math.max(1, bandedS)) * 5);

  const salmonView = (): SalmonView => {
    const L = salmon.pos(salmon.y, salmon.lane);
    return {
      run: salmon.run, y: salmon.y, lane: salmon.lane, home: salmon.home, lost: salmon.lost, alive: salmon.alive(),
      needLeap: salmon.needLeap, leaping: salmon.leaping, stuck: salmon.stuck, restarting: salmon.y <= 4,
      intro: salmon.intro, introTotal: salmon.introTotal,
      heading: salmon.heading(salmon.y),
      path: Array.from({ length: Math.ceil(terrain.ny / 4) }, (_, k) => { const p = salmon.pos(k * 4, 0); return [p.x, p.y] as [number, number]; }),
      leader: L,
      fish: salmon.fish.map((f) => ({ ...salmon.pos(salmon.y + f.dy, f.lane), alive: f.alive })),
      predators: salmon.predators.map((p) => ({ ...p, x: salmon.pos(p.y, p.kind === 'bear' ? p.side * 1.25 : p.lane).x, cx: salmon.pos(p.y, 0).x })),
    };
  };

  const sim = {
    update(dt: Seconds) {
      const at = planAt(t, scale);
      const b = at.block;
      if (at.index !== lastBlock) {
        lastBlock = at.index;
        const prevPhase = at.index > 0 ? PLAN[at.index - 1].phase : null;
        cue('blockStart', { name: b.name, style: b.style, phase: b.phase, index: at.index, firstOfPhase: prevPhase !== b.phase });
        if (b.phase === 'river' && prevPhase === 'rain') {
          sourceX = clamp(sky.springX(), 12, NX - 12);
          cue('springRises', { x: +sourceX.toFixed(1), rained: Math.round(sky.rained) });
        }
        if (b.style === 'salmon' && !salmon.active) {
          measure(); salmon.updatePath(water.w);
          const size = 8 + Math.min(12, Math.floor(carved / 1000));
          salmon.start(size, DEFAULT_SALMON);
          cue('salmonRun', { fish: size + 1 });
        } else if (b.style !== 'salmon' && salmon.active) salmon.stop();
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

      // steering: the spring (▲▼, shifters up/down), or the salmon school in the fish's frame
      // (◀▶, Z/A, paddles analog, left hood darts left, right hood darts right)
      let dir = 0, nudge = 0, steer = 0, dart = 0;
      if (input.held.has('up')) dir -= 1;
      if (input.held.has('down')) dir += 1;
      for (const p of input.pressed) {
        if (p === 'shiftUpL' || p === 'shiftUpR') nudge -= 1;
        if (p === 'shiftDnL' || p === 'shiftDnR') nudge += 1;
        if (p === 'shiftUpL' || p === 'shiftDnL') dart -= 1;
        if (p === 'shiftUpR' || p === 'shiftDnR') dart += 1;
      }
      if (input.held.has('right') || input.held.has('a')) steer += 1;
      if (input.held.has('left') || input.held.has('z')) steer -= 1;
      steer = clamp(steer + input.paddleR - input.paddleL, -1, 1);
      const powerFrac = clamp(bike.power3s / ctx.profile.ftp, 0, 2);
      const flowing = cadence > 20 && !at.done;
      const ap = !!opts.autopilot;
      let flow = 0, area: Emit['area'];
      raining = 0;
      if (b.phase === 'evaporate') {
        for (const c of sky.evaporate(dt, { cadNorm, power: flowing ? powerFrac : 0, steer, nudge: dart, autopilot: ap }, DEFAULT_SKY)) if (c.type === 'sunlit') cue('sunlit', undefined, false);
      } else if (b.phase === 'cloud') {
        for (const c of sky.drift(dt, at.blockT / (b.minutes * 60 * scale), { steer, nudge: dart, autopilot: ap }, DEFAULT_SKY)) {
          if (c.type === 'puff') cue('cloudlet', { size: +c.size.toFixed(1) }); else cue('cloudletMissed', undefined, false);
        }
      } else if (b.phase === 'rain') {
        flow = flowing ? tun.flowPerFtp() * powerFrac * sky.rainFactor(DEFAULT_SKY) : 0;
        area = sky.rain(dt, { steer, nudge: dart, autopilot: ap, flow }, DEFAULT_SKY);
        raining = flow;
      } else if (salmon.active) {
        const sc = salmon.update(dt, water.w, { cadence, cadNorm, steer, nudge: dart, autopilot: !!opts.autopilot, mayRestart: at.blockLeft > 45 * scale }, DEFAULT_SALMON);
        for (const c of sc) {
          if (c.type === 'home') cue('salmonHome', { fish: c.fish, lost: c.lost });
          else if (c.type === 'run') cue('salmonRun', { fish: c.fish });
          else if (c.type === 'go') cue('salmonGo', { run: c.run }, false);
          else if (c.type === 'strike') cue('predatorStrike', { kind: c.kind, caught: c.caught });
          else if (c.type === 'warn') cue('predatorWarn', { kind: c.kind }, false);
          else cue(c.type === 'leap' ? 'salmonLeap' : 'salmonStuck');
        }
      } else if (opts.autopilot) sourceX = sky.springX() + 14 * Math.sin((2 * Math.PI * t) / 240);
      else sourceX += dir * tun.steerRate() * dt + nudge * tun.shiftStep();
      sourceX = clamp(sourceX, 12, NX - 12);
      if (b.phase === 'river' || b.phase === 'salmon') flow = flowing ? tun.flowPerFtp() * powerFrac : 0;

      const emit: Emit = {
        flow, area,
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
        if (salmon.active) salmon.updatePath(water.w);
        while (cutIdx < cutMarks.length && deepestCut >= cutMarks[cutIdx]) cue('gorge', { depth: cutMarks[cutIdx++] });
        while (deltaIdx < deltaMarks.length && delta >= deltaMarks[deltaIdx]) cue('deltaGrew', { volume: deltaMarks[deltaIdx++] });
      }
      if (!saved && t >= rideS) {
        saved = true; measure();
        const prev = ctx.load<WatershedSave>() ?? {};
        ctx.save({
          rides: (prev.rides ?? 0) + 1, bestCarved: Math.max(prev.bestCarved ?? 0, Math.round(carved)),
          bestDelta: Math.max(prev.bestDelta ?? 0, Math.round(delta)), bestSalmon: Math.max(prev.bestSalmon ?? 0, salmon.home),
          bestScore: Math.max(prev.bestScore ?? 0, score()),
        });
        cue('rideDone', { carved: Math.round(carved), delta: Math.round(delta), salmon: salmon.home, score: score() });
      }
      ctx.debug('watershed.block', b.name); ctx.debug('watershed.parcels', water.n);
      ctx.debug('watershed.dropVol', +dropVol.toFixed(2)); ctx.debug('watershed.inBand', inBand);
      ctx.debug('watershed.carved', Math.round(carved)); ctx.debug('watershed.delta', Math.round(delta));
    },
    hud(): GameHud {
      const b = planAt(t, scale).block;
      const fish = salmon.active;
      const label = { grind: 'Grind', spin: 'Spin', steady: b.phase === 'evaporate' ? 'Spin' : 'Steady', salmon: salmon.needLeap ? 'Leap: 95+' : 'Swim', free: 'Easy' }[b.style];
      return {
        targetCadence: fish && salmon.needLeap ? { min: DEFAULT_SALMON.leapRpm, label } : b.rpm ? { ...b.rpm, label } : undefined,
        gears: false,
        controls: b.phase === 'evaporate' || b.phase === 'cloud' || b.phase === 'rain'
          ? [{ button: 'paddles', label: b.phase === 'evaporate' ? 'Steer the vapor' : 'Steer the cloud' }, { button: 'dpad', label: '◀▶ Steer' },
            { button: 'shiftersL', label: 'Drift left' }, { button: 'shiftersR', label: 'Drift right' }]
          : fish
          ? [{ button: 'paddles', label: 'Steer the school' }, { button: 'dpad', label: '◀▶ Steer' },
            { button: 'shiftersL', label: 'Dart left' }, { button: 'shiftersR', label: 'Dart right' }]
          : [{ button: 'dpad', label: '▲▼ Move the spring' }, { button: 'shiftersR', label: 'Nudge the spring' }],
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
        phase: at.block.phase,
        sky: { vapor: sky.vapor, x: sky.x, y: sky.y, size: sky.size, radius: sky.radius, seaY: sky.seaY, inSun: sky.inSun, sun: sky.sun, puffs: sky.puffs, rained: sky.rained, raining, springX: sky.springX() },
        salmon: salmon.active ? salmonView() : null,
        cues,
        hooks: { cadence: salmon.active && salmon.needLeap ? 102 : bandMid(at.block) },
      };
    },
    isOver: () => t >= rideS,
    summary() {
      measure();
      const banded = bandedS;
      return {
        score: score(),
        vapor: Math.round(sky.vapor), cloudlets: sky.puffsCaught, rainfall: Math.round(sky.rained),
        carved: Math.round(carved), delta: Math.round(delta), deepestCut: +deepestCut.toFixed(1),
        toSea: Math.round(water.stats.toSea), minutesInBand: +(bandS / 60).toFixed(1),
        bandPct: Math.round((100 * bandS) / Math.max(1, banded)), blocks: lastBlock + 1, parcels: water.stats.spawned,
        salmonHome: salmon.home, salmonLost: salmon.lost,
      };
    },
    dispose() { ctx.resistance.clear('flow'); },
  };
  return sim;
}
