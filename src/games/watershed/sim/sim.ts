import type { GameContext, GameHud, GameSim, Seconds } from '../../../contracts';
import { bandMid, makePlan, planAt, planMinutes, RIDE_BLURB, RIDE_LENGTHS, type Block, type Phase, type Style } from './plan';
import { DEFAULT_SKY, Sky, type Puff, type SunSpot } from './sky';
import type { WatershedSave } from '../card';
import { makeTerrain, NX, type Terrain } from './terrain';
import { DEFAULT_SALMON, SalmonRun, type Predator } from './salmon';
import { Jobs, type Dam, type Field, type Mill, type Objective } from './objectives';
import { dealEvents, GeoEvents, type EventKind, type GeoEvent } from './events';
import { DEFAULT_WATER, Water, type Emit, type WaterParams } from './water';
import { FREE_RIDE, LEVELS, LevelRun, levelById, levelPlan, levelsCleared, suggestedLevel, totalDrops, unlocked, type LevelMetrics, type LevelView } from './levels';

/**
 * `length` (minutes) skips the pre-game menu; `menu: false` skips it with the saved/default length. `skipWarmup`
 * starts at the rain (the menu's default; the rider can toggle it there).
 */
export interface WatershedOpts { seed?: number; autopilot?: boolean; terrainSeed?: number; length?: number; menu?: boolean; skipWarmup?: boolean; /** force the geological event deck (else dealt from the seed) */ events?: EventKind[];
  /** Play this campaign level (skips the menu); 'free' = Free Ride. */ level?: string }

/** One entry in the pre-game level picker. */
export interface MenuLevel { id: string; n: number; name: string; blurb: string; goal: string; bonus: string[]; minutes: number; drops: number; locked: boolean; blocks: Array<{ phase: Phase; minutes: number }> }

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
  /**
   * The pre-game menu (null once the ride has started): the campaign levels plus Free Ride (`levels`, `level` = the
   * selected index); Free Ride's ride lengths are `options` (`sel` = the selected length).
   */
  menu: { level: number; levels: MenuLevel[]; drops: number; maxDrops: number;
    sel: number; left: number; skipWarmup: boolean; /** `length` = the menu choice; `minutes` = what the ride actually lasts (shorter without the warm-up). */
    options: Array<{ length: number; minutes: number; blurb: string; blocks: Array<{ phase: Phase; minutes: number }> }> } | null;
  /** The campaign level being played (null in Free Ride). */
  level: LevelView | null;
  /** Geological events this ride (pending/warning/active/done), and the ground-material grid (lava/scorched/debris). */
  events: Array<Omit<GeoEvent, 'edits' | 'marks'>>;
  mat: Uint8Array;
  phase: Phase;
  view: 'overview' | 'follow';
  springs: Array<{ x: number; share: number }>;
  boost: { active: boolean; ready: boolean; cd: number; total: number };
  sky: SkyView;
  jobs: { mills: Mill[]; village: Jobs['village']; fields: Field[]; dam: Omit<Dam, 'added' | 'base' | 'cells'> | null; objective: Objective | null;
    /** Millbrook's levee (campaign level 5): 0..1 built. */ levee: number | null };
  salmon: SalmonView | null;
  /** Recent one-shot cues for the renderer (sounds, popups); ids increase. */
  cues: Cue[];
  hooks: { cadence: number };
  /** Bumped each time the rider presses Z (the renderer flies the camera to the next landmark). */
  look: number;
  /** The rider's current marker during river blocks (grid coords), else null. */
  current: { x: number; y: number; steering: boolean } | null;
}

export interface SkyView {
  vapor: number; x: number; y: number; size: number; radius: number; seaY: number; inSun: boolean;
  sun: SunSpot[]; puffs: Puff[]; caught: number; rained: number; raining: number; springX: number;
}
export interface Cue { id: number; type: string; data?: Record<string, number | string | boolean> }
export interface SalmonView {
  run: number; y: number; lane: number; home: number; lost: number; alive: number; forkAhead: boolean;
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
const BOOST_LABEL: Record<Phase, string> = { evaporate: 'Heat wave', cloud: 'Inhale', rain: 'Cloudburst', river: 'Surge', salmon: 'Sprint' };

export function createWatershedSim(ctx: GameContext, opts: WatershedOpts = {}): GameSim & { snapshot(): WatershedSnapshot } {
  const tn = ctx.tuning;
  const tun = {
    planScale: tn.num('planScale', 1, 0.1, 2, 0.05, 'Multiply every block length (1 = the 45 min ride)'),
    warmCloud: tn.num('warmCloud', 90, 0, 200, 5, 'Cloud size a skipped warm-up starts the rain with'),
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
    currentK: tn.num('currentK', 3, 0, 10, 0.1, 'Current marker: sideways pull per cell of offset (cells/s² per cell)'),
    currentMax: tn.num('currentMax', 10, 0, 30, 0.5, 'Current marker: strongest sideways pull (cells/s²)'),
    currentRows: tn.num('currentRows', 8, 2, 20, 1, 'Current marker: rows above/below it that feel the pull'),
    currentMinSpeed: tn.num('currentMinSpeed', 0.6, 0.1, 5, 0.1, 'Current marker: slowest drift downstream (rows/s, e.g. across a lake)'),
    currentMaxSpeed: tn.num('currentMaxSpeed', 4, 0.5, 12, 0.5, 'Current marker: fastest drift downstream (rows/s)'),
    talus: tn.num('talus', DEFAULT_WATER.talus, 0.2, 4, 0.05, 'Banks: steepest soil step before it slumps'),
    gateHeight: tn.num('gateHeight', 2.6, 0.5, 6, 0.1, 'Beaver gate: height of the finished dam'),
    gateBandS: tn.num('gateBandS', 20, 5, 120, 1, 'Beaver gate: seconds to build while cadence is in the band'),
    gateOffS: tn.num('gateOffS', 90, 10, 600, 5, 'Beaver gate: seconds to build while cadence is out of the band'),
    leveeHeight: tn.num('leveeHeight', 1.8, 0.3, 5, 0.1, 'Levee: full height around Millbrook'),
    leveeBandS: tn.num('leveeBandS', 150, 20, 600, 5, 'Levee: seconds in the band to build it fully'),
    logDamHeight: tn.num('logDamHeight', 2.4, 0.5, 6, 0.1, 'Old log dam: tallest it stands (its crest stays under the next saddle)'),
    logDamHard: tn.num('logDamHard', 0.2, 0.05, 1, 0.05, 'Old log dam: erodibility (lower = tougher)'),
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
  // ride length: chosen in the pre-game menu (or given in opts); the plan is rebuilt for it
  const prevSave = ctx.load<WatershedSave>() ?? {};
  let rideMin = opts.length ?? prevSave.lastLength ?? 45;
  let skipWarmup = !!opts.skipWarmup;
  let menu = opts.length === undefined && opts.level === undefined && !opts.autopilot && opts.menu !== false;
  /** The campaign level (null = Free Ride). */
  // the picker opens on the next campaign level (or on Free Ride for a rider who last chose it)
  let levelDef = levelById(opts.level ?? (menu && prevSave.lastLevel !== FREE_RIDE.id ? suggestedLevel(prevSave.levels) : undefined));
  let plan: Block[] = levelDef ? levelPlan(levelDef, skipWarmup) : makePlan(rideMin, skipWarmup);
  let rideS = planMinutes(plan) * 60 * scale;
  let menuSel = Math.max(0, RIDE_LENGTHS.indexOf(rideMin as (typeof RIDE_LENGTHS)[number])), menuT = 0;
  /** Picker entries: every campaign level, then Free Ride. */
  const ENTRIES = [...LEVELS.map((l) => l.id), FREE_RIDE.id];
  let menuLevel = Math.max(0, ENTRIES.indexOf(levelDef?.id ?? FREE_RIDE.id));
  const isOpen = (k: number) => { const d = levelById(ENTRIES[k]); return !d || unlocked(prevSave.levels, d); };
  const pendingActions: Array<{ type?: string; minutes?: number; skip?: boolean; id?: string }> = [];
  let levelRun: LevelRun | null = null;

  let t = 0, sourceX = NX / 2, bandS = 0, bonus = 0, lastBlock = -1;
  let cadence = 0, cadNorm = 0.5, dropVol = 0.3, inBand = false;
  let carved = 0, delta = 0, deepestCut = 0, statAcc = 1;
  const cutMarks = [2, 4, 6, 8, 10], deltaMarks = [25, 50, 100, 200, 400];
  let cutIdx = 0, deltaIdx = 0, saved = false;
  const salmon = new SalmonRun(terrain, ctx.rng);
  const BOOST_S = 3, BOOST_CD = 10;
  let boostT = 0, boostCd = 0, view: 'overview' | 'follow' = 'overview', look = 0;
  /** The rider's current marker (river blocks): grid position, seconds since the last steering input, passes made. */
  const cur = { x: NX / 2, y: 4, idle: 99, passes: 0 };
  const sky = new Sky(terrain.nx, terrain.ny, terrain.coastY, ctx.rng);
  let raining = 0;
  /** The springs (largest first). The first is the one the rider steers; the others stay where the rain put them. */
  let springs: Array<{ x: number; share: number }> = [{ x: NX / 2, share: 1 }];
  let forkCued = false;
  const jobs = new Jobs(terrain);
  const geo = new GeoEvents(terrain, menu || levelDef ? [] : dealEvents(terrainSeed, plan, opts.events), terrainSeed);   // no random geology inside a level
  if (!menu && skipWarmup) sky.preset(tun.warmCloud());
  /** Max water depth within ~4 cells (cheap: 9 samples). */
  const nearW = (x: number, y: number) => {
    let m = 0;
    for (const dy of [-4, 0, 4]) for (const dx of [-4, 0, 4]) {
      const i = Math.round(x + dx), j = Math.round(y + dy);
      if (i >= 0 && i < terrain.nx && j >= 0 && j < terrain.ny) m = Math.max(m, water.w[j * terrain.nx + i]);
    }
    return m;
  };
  const jobCue = (c: ReturnType<Jobs['update']>[number]) => {
    if (c.type === 'objectiveDone' || c.type === 'objectiveFailed') cue(c.type, { kind: c.kind });
    else if (c.type === 'millTurning') cue('millTurning', { kind: c.kind }, false);
    else cue(c.type, undefined, c.type !== 'flooding');
  };
  /** Columns near the head of the valley where the rider carved a channel (local maxima of cut depth). */
  const carvedHeads = (): number[] => {
    const { nx, h, h0 } = terrain, cut = new Float32Array(nx);
    for (let i = 0; i < nx; i++) for (let j = 8; j <= 20; j++) cut[i] = Math.max(cut[i], h0[j * nx + i] - h[j * nx + i]);
    const out: number[] = [];
    const order = Array.from(cut.keys()).sort((a, b) => cut[b] - cut[a]);
    for (const i of order) { if (cut[i] < 1.2 || out.length >= 4) break; if (i > 11 && i < nx - 12 && out.every((x) => Math.abs(x - i) >= 10)) out.push(i); }
    return out;
  };
  const mergeSprings = (cur: Array<{ x: number; share: number }>, xs: number[]) => {
    const all = [...cur.map((c) => c.x)];
    for (const x of xs) if (all.every((y) => Math.abs(y - x) >= 8)) all.push(x);
    return all.slice(0, 5).map((x) => ({ x, share: 1 / Math.min(5, all.length) }));
  };
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

  let bandedS = plan.reduce((a, b) => a + (b.rpm ? b.minutes * 60 * scale : 0), 0);
  /** Campaign level state the sim measures (cumulative). */
  const lm = { surgesHeld: 0, surgesLost: 0, damBrokenAt: 0, bandSoFar: 0, riverS: 0 };
  let gateCued = false, leveeMark = 0;
  /** Set up the chosen campaign level's valley: its tools and set pieces. */
  const setupLevel = () => {
    levelRun = levelDef ? new LevelRun(levelDef) : null;
    if (!levelDef) return;
    if (levelDef.logDam) {
      // the old log dam stands across the natural first crossing (ridge 1's lowest saddle), its crest a little under
      // the next-lowest saddle so the lake behind it spills over the logs (not around them)
      const crest = (q: { x: number; ridge: number }) => terrain.h[q.ridge * terrain.nx + q.x];
      const r1 = terrain.saddles.filter((q) => q.ridge === terrain.ridges[0]), s = r1.reduce((a, q) => (crest(q) < crest(a) ? q : a));
      const next = Math.min(...r1.filter((q) => q !== s).map(crest));
      jobs.logDam(s.x, s.ridge, clamp(next - crest(s) - 0.4, 0.5, tun.logDamHeight()), tun.logDamHard());
    }
    if (levelDef.tools?.includes('levee')) jobs.planLevee(tun.leveeHeight());
  };
  const startRide = () => {
    levelDef = levelById(ENTRIES[menuLevel]);
    rideMin = RIDE_LENGTHS[menuSel];
    plan = levelDef ? levelPlan(levelDef, skipWarmup) : makePlan(rideMin, skipWarmup);
    rideS = planMinutes(plan) * 60 * scale;
    if (skipWarmup) sky.preset(tun.warmCloud());
    geo.events = levelDef ? [] : dealEvents(terrainSeed, plan, opts.events);
    bandedS = plan.reduce((a, b) => a + (b.rpm ? b.minutes * 60 * scale : 0), 0);
    menu = false;
    setupLevel();
    ctx.save({ ...(ctx.load<WatershedSave>() ?? {}), lastLength: rideMin, lastLevel: ENTRIES[menuLevel] });
    cue('rideLength', { minutes: planMinutes(plan), skipWarmup, level: ENTRIES[menuLevel] });
    if (levelDef) cue('levelStart', { id: levelDef.id, n: levelDef.n, name: levelDef.name, goal: levelDef.goal.title, teaches: levelDef.teaches });
  };
  if (!menu) setupLevel();
  /** What the campaign level measures, right now. */
  const metrics = (): LevelMetrics => {
    const d = jobs.dam;
    return {
      deepestCut, carved, delta, toSea: water.stats.toSea,
      flour: jobs.mills[0].output, planks: jobs.mills[1].output, harvests: jobs.harvests, drownedS: jobs.drownedS,
      surgesHeld: lm.surgesHeld, surgesLost: lm.surgesLost, floodS: jobs.village.floodS,
      damHealth: d && d.kind === 'log' ? d.health : 1, damBroken: !!d && d.kind === 'log' && d.broken, damBrokenAt: lm.damBrokenAt,
      salmonHome: salmon.home, salmonLost: salmon.lost,
      bandPct: Math.round((100 * bandS) / Math.max(1, lm.bandSoFar)), t,
    };
  };
  /** The level goal as a job-style objective (so the HUD bar and the target marker show it). */
  const levelObjective = (): Objective | null => {
    if (!levelRun) return null;
    const v = levelRun.view(metrics()), k = levelRun.def.goal.kind;
    const fieldNear = () => jobs.fields.reduce((a, f) => (Math.abs(f.x - cur.x) < Math.abs(a.x - cur.x) ? f : a));
    const target = k === 'grist' ? jobs.mills[0] : k === 'village' ? jobs.village : k === 'dam' ? jobs.dam : k === 'harvest' ? fieldNear() : null;
    return { kind: k, title: v.goal.title, goal: v.goal.hint, progress: v.goal.progress, state: v.goal.state, target: target ? { x: target.x, y: target.y } : null };
  };
  /** Campaign: the beaver crew gates the saddle nearest (x, y) on the next ridge down (or right there, away from a ridge). */
  const placeGate = (x: number, y: number) => {
    const ridge = terrain.ridges.find((r) => r >= y - 4);
    let gx = x, gy = y;
    if (ridge !== undefined) {
      const s = terrain.saddles.filter((q) => q.ridge === ridge).reduce((a, q) => (Math.abs(q.x - x) < Math.abs(a.x - x) ? q : a));
      gy = ridge; if (Math.abs(s.x - x) <= 12) gx = s.x;
    }
    jobs.gate(gx, gy, tun.gateHeight(), 1 / tun.gateOffS());
    gateCued = false;
    cue('gate', { x: Math.round(gx), y: Math.round(gy) });
  };
  /** The ride score: every phase of the cycle counts. */
  const score = () => Math.max(0, Math.round(sky.vapor * 2 + sky.puffsCaught * 20 + sky.rained * 0.05 + carved / 20 + delta / 20
    + salmon.home * 20 + (100 * bandS / Math.max(1, bandedS)) * 5
    + jobs.objectivesDone * 250 + jobs.harvests * 40 + jobs.damsBroken * 100 + (jobs.mills[0].output + jobs.mills[1].output) * 2 - jobs.village.floodS * 2));

  const salmonView = (): SalmonView => {
    const L = salmon.pos(salmon.y, salmon.lane);
    return {
      run: salmon.run, y: salmon.y, lane: salmon.lane, home: salmon.home, lost: salmon.lost, alive: salmon.alive(),
      forkAhead: salmon.forkAhead(), needLeap: salmon.needLeap, leaping: salmon.leaping, stuck: salmon.stuck, restarting: salmon.y <= 4,
      intro: salmon.intro, introTotal: salmon.introTotal,
      heading: salmon.heading(salmon.y),
      path: Array.from({ length: Math.ceil(terrain.ny / 4) }, (_, k) => { const p = salmon.pos(k * 4, 0); return [p.x, p.y] as [number, number]; }),
      leader: L,
      fish: salmon.fish.map((f) => ({ ...salmon.pos(salmon.y + f.dy, f.lane), alive: f.alive })),
      predators: salmon.predators.map((p) => ({ ...p, x: salmon.pos(p.y, p.kind === 'bear' ? p.side * 1.25 : p.lane).x, cx: salmon.pos(p.y, 0).x })),
    };
  };

  /** Close a flood surge: held if Millbrook stood in water under 10 s of it. */
  function settleSurge() {
    if (!levelRun) return;
    if (jobs.village.floodBlockS < 10) lm.surgesHeld++; else lm.surgesLost++;
    cue(jobs.village.floodBlockS < 10 ? 'surgeHeld' : 'surgeLost', { held: lm.surgesHeld, lost: lm.surgesLost });
  }
  /** Re-evaluate the level goal (cue its completion / failure). */
  function levelTick(over: boolean) {
    if (!levelRun) return;
    const r = levelRun.update(metrics(), over);
    if (r === 'done') cue('objectiveDone', { kind: levelRun.def.goal.kind, level: true });
    else if (r === 'failed') cue('objectiveFailed', { kind: levelRun.def.goal.kind, level: true });
  }
  let campaign = { drops: totalDrops(prevSave.levels), cleared: levelsCleared(prevSave.levels) };

  const sim = {
    update(dt: Seconds) {
      if (menu) {
        // pre-game menu: pick the ride length (◀▶ / ▲▼ / shifters, Y toggles the warm-up, A starts, or taps); auto-starts after 25 s
        ctx.resistance.clear('flow');
        const input = ctx.input();
        // ◀▶ / shifters: level (locked levels are skipped); ▲▼: Free Ride's length
        let move = 0, len = 0;
        for (const p of input.pressed) {
          if (p === 'right' || p === 'shiftUpR' || p === 'shiftDnR') move++;
          if (p === 'left' || p === 'shiftUpL' || p === 'shiftDnL') move--;
          if (p === 'down') len++;
          if (p === 'up') len--;
        }
        if (move) {
          let k = menuLevel;
          for (let n = 0; n < Math.abs(move); n++) { let q = k + Math.sign(move); while (q >= 0 && q < ENTRIES.length && !isOpen(q)) q += Math.sign(move); if (q >= 0 && q < ENTRIES.length) k = q; }
          if (k !== menuLevel) { menuLevel = k; cue('menuMove', undefined, false); }
        }
        if (len) {
          if (ENTRIES[menuLevel] !== FREE_RIDE.id) menuLevel = ENTRIES.length - 1;
          else menuSel = clamp(menuSel + len, 0, RIDE_LENGTHS.length - 1);
          cue('menuMove', undefined, false);
        }
        if (input.pressed.has('y')) { skipWarmup = !skipWarmup; cue('menuMove', undefined, false); }
        let go = input.pressed.has('a');
        for (const a of pendingActions.splice(0)) {   // taps win over a same-tick d-pad move
          if (a.type === 'length' && typeof a.minutes === 'number') { const k = RIDE_LENGTHS.indexOf(a.minutes as (typeof RIDE_LENGTHS)[number]); if (k >= 0) { menuSel = k; menuLevel = ENTRIES.length - 1; } }
          if (a.type === 'level' && typeof a.id === 'string') { const k = ENTRIES.indexOf(a.id); if (k >= 0 && isOpen(k)) menuLevel = k; }
          if (a.type === 'warmup') skipWarmup = typeof a.skip === 'boolean' ? a.skip : !skipWarmup;
          if (a.type === 'start') go = true;
        }
        menuT += dt;
        if (go || menuT >= 25) startRide();
        return;
      }
      const at = planAt(t, scale, plan);
      const b = at.block;
      if (at.index !== lastBlock) {
        lastBlock = at.index;
        const prevPhase = at.index > 0 ? plan[at.index - 1].phase : null;
        for (const c of jobs.end()) jobCue(c);
        if (at.index > 0 && plan[at.index - 1].surge) settleSurge();
        jobs.watchVillage = !!b.surge;
        if (b.surge) jobs.village.floodBlockS = 0;
        cue('blockStart', { name: b.name, style: b.style, phase: b.phase, index: at.index, firstOfPhase: prevPhase !== b.phase });
        jobs.begin(b.job ?? null, b.minutes * 60 * scale);
        if (jobs.objective) cue('objective', { kind: jobs.objective.kind, title: jobs.objective.title, goal: jobs.objective.goal });
        if (b.beavers) for (const c of jobs.beavers(water.w)) jobCue(c);
        if (b.phase === 'river' && prevPhase === 'rain') {
          springs = sky.springs().map((sp) => ({ x: clamp(sp.x, 12, NX - 12), share: sp.share }));
          sourceX = springs[0].x;
          cue('springRises', { x: +sourceX.toFixed(1), rained: Math.round(sky.rained), springs: springs.length });
        }
        if (b.style === 'salmon' && !salmon.active) {
          // every channel you carved gets water: carved channel heads near the top become springs too
          springs = mergeSprings(springs, carvedHeads());
          measure(); salmon.updatePath(water.w);
          const size = 8 + Math.min(12, Math.floor(carved / 1000));
          salmon.start(size, DEFAULT_SALMON);
          cue('salmonRun', { fish: size + 1 });
        } else if (b.style !== 'salmon' && salmon.active) salmon.stop();
      }
      ctx.resistance.set({ id: 'flow', mode: 'erg', ftpFraction: +at.ftp.toFixed(3) });
      for (const c of geo.update(dt, at.index, at.blockT, b.minutes * 60 * scale, water.w)) {
        if (c.type === 'eventWarn') cue('eventWarn', { kind: c.kind }, false);
        else if (c.type === 'eventHit') cue('eventHit', { kind: c.kind, x: +c.x.toFixed(1), y: +c.y.toFixed(1) });
        else cue('eventDone', { kind: c.kind });
      }

      const bike = ctx.bike(), input = ctx.input();
      cadence = bike.cadence3s;
      const lo = tun.rpmLow(), hi = tun.rpmHigh();
      cadNorm = clamp((cadence - lo) / Math.max(1, hi - lo), 0, 1);
      dropVol = tun.volHeavy() + (tun.volLight() - tun.volHeavy()) * cadNorm;
      inBand = !!b.rpm && cadence >= b.rpm.min && (b.rpm.max === undefined || cadence <= b.rpm.max);
      bonus += ((inBand ? 1 : 0) - bonus) * (1 - Math.exp(-dt / 1.5));
      if (inBand) bandS += dt;
      if (b.rpm) lm.bandSoFar += dt;
      if (b.phase === 'river') lm.riverS += dt;
      const tools = levelDef?.tools ?? [];
      const river = b.phase === 'river' && !salmon.active;
      // campaign tools: the beaver crew builds a gate fast while you're in the band; the villagers raise the levee
      // between surges while you're in the band
      if (jobs.dam?.kind === 'gate' && !jobs.dam.broken) {
        jobs.dam.rate = 1 / (inBand ? tun.gateBandS() : tun.gateOffS());
        if (jobs.dam.build >= 1 && !gateCued) { gateCued = true; cue('gateBuilt', { x: jobs.dam.x }); }
      }
      if (jobs.levee && river) {
        jobs.workLevee(inBand && !b.surge ? dt / tun.leveeBandS() : 0, dt);
        const mark = Math.floor(jobs.levee.build * 4);
        if (mark > leveeMark) { leveeMark = mark; cue('levee', { built: mark * 25 }); }
      }

      // controls (every view looks up the valley, so screen right = −x across the valley):
      //   ◀▶ held / paddles (analog) steer; left hood darts left (up = big, down = small), right hood darts right;
      //   Y toggles overview/follow; A = the phase's boost (on a cooldown)
      let steer = 0, dart = 0;
      if (input.held.has('right')) steer += 1;
      if (input.held.has('left')) steer -= 1;
      steer = clamp(steer + input.paddleR - input.paddleL, -1, 1);
      for (const p of input.pressed) {
        if (p === 'shiftUpL') dart -= 1; else if (p === 'shiftDnL') dart -= 0.35;
        else if (p === 'shiftUpR') dart += 1; else if (p === 'shiftDnR') dart += 0.35;
        else if (p === 'y') { view = view === 'follow' ? 'overview' : 'follow'; cue('view', { view }, false); }
        else if (p === 'z') { look++; cue('look', { n: look }, false); }
        else if (p === 'a' && tools.includes('gate') && river && !at.done) placeGate(cur.x, cur.y);
        else if (p === 'a' && boostCd <= 0 && !at.done) { boostT = BOOST_S; boostCd = BOOST_CD; cue('boost', { phase: b.phase }); }
      }
      if (opts.autopilot && boostCd <= 0 && (b.phase === 'salmon' || b.phase === 'cloud')) { boostT = BOOST_S; boostCd = BOOST_CD; cue('boost', { phase: b.phase }); }
      boostT = Math.max(0, boostT - dt); boostCd = Math.max(0, boostCd - dt);
      const boosting = boostT > 0;
      const powerFrac = clamp(bike.power3s / ctx.profile.ftp, 0, 2);
      const flowing = cadence > 20 && !at.done;
      const ap = !!opts.autopilot;
      let flow = 0, area: Emit['area'];
      raining = 0;
      if (b.phase === 'evaporate') {
        for (const c of sky.evaporate(dt, { cadNorm, power: flowing ? powerFrac * (boosting ? 1.6 : 1) : 0, steer, nudge: dart, autopilot: ap }, DEFAULT_SKY)) if (c.type === 'sunlit') cue('sunlit', undefined, false);
      } else if (b.phase === 'cloud') {
        for (const c of sky.drift(dt, at.blockT / (b.minutes * 60 * scale), { steer, nudge: dart, autopilot: ap, reach: boosting ? 1.6 : 1 }, DEFAULT_SKY)) {
          if (c.type === 'puff') cue('cloudlet', { size: +c.size.toFixed(1) }); else cue('cloudletMissed', undefined, false);
        }
      } else if (b.phase === 'rain') {
        flow = flowing ? tun.flowPerFtp() * powerFrac * sky.rainFactor(DEFAULT_SKY) * (boosting ? 1.8 : 1) : 0;
        area = sky.rain(dt, { steer, nudge: dart, autopilot: ap, flow }, DEFAULT_SKY);
        raining = flow;
      } else if (salmon.active) {
        if (salmon.intro > 0 && salmon.run === 1) {
          // while the camera sweeps, it rains across the head of the valley so every channel fills
          area = { x: NX / 2, y: 14, r: 0, w: NX - 24, h: 18 };
          raining = tun.flowPerFtp() * powerFrac;
        }
        if (salmon.forkAhead() && !forkCued) { forkCued = true; cue('fork', undefined, false); }
        if (!salmon.forkAhead()) forkCued = false;
        const sc = salmon.update(dt, water.w, { cadence, cadNorm, steer, nudge: dart, autopilot: !!opts.autopilot, mayRestart: at.blockLeft > 45 * scale, sprint: boosting }, DEFAULT_SALMON);
        for (const c of sc) {
          if (c.type === 'home') cue('salmonHome', { fish: c.fish, lost: c.lost });
          else if (c.type === 'run') cue('salmonRun', { fish: c.fish });
          else if (c.type === 'go') cue('salmonGo', { run: c.run }, false);
          else if (c.type === 'strike') cue('predatorStrike', { kind: c.kind, caught: c.caught });
          else if (c.type === 'warn') cue('predatorWarn', { kind: c.kind }, false);
          else cue(c.type === 'leap' ? 'salmonLeap' : 'salmonStuck');
        }
      } else if (opts.autopilot) {
        // autopilot heads for the current job (or away from the village in a flood), else wanders
        const o = jobs.objective ?? levelObjective();
        let goal = o && o.state === 'active' && o.target ? (o.kind === 'village' ? (o.target.x < NX / 2 ? NX - 22 : 22) : o.target.x) : springs[0].x + 10 * Math.sin((2 * Math.PI * t) / 240);
        // fields: run beside the nearest field, not over it
        if (o?.kind === 'harvest' && o.target) goal = o.target.x + (o.target.x < NX / 2 ? 6 : -6);
        // a gate level: gate the easy (lowest) ridge-1 saddle once the river runs (again if it washes out), then steer for the mill
        if (tools.includes('gate') && river && (!jobs.dam || jobs.dam.broken) && at.blockT > 20) {
          const crest = (q: { x: number; ridge: number }) => terrain.h[q.ridge * terrain.nx + q.x];
          const s = terrain.saddles.filter((q) => q.ridge === terrain.ridges[0]).reduce((a, q) => (crest(q) < crest(a) ? q : a));
          if (Math.abs(s.x - jobs.mills[0].x) > 6) placeGate(s.x, terrain.ridges[0] - 6);
        }
        sourceX += clamp(goal - sourceX, -tun.steerRate() * dt, tun.steerRate() * dt);
        if (b.phase === 'river') { cur.x += clamp(goal - cur.x, -tun.steerRate() * dt, tun.steerRate() * dt); cur.idle = 0; }
        if (o && o.kind === 'dam' && o.state === 'active' && boostCd <= 0) { boostT = BOOST_S; boostCd = BOOST_CD; cue('boost', { phase: b.phase }); }
      }
      else if (b.phase === 'river') {
        // river blocks: the rider steers the current marker at the river's head; near the top it carries the spring
        const move = steer * tun.steerRate() * dt + dart * tun.shiftStep();
        cur.x -= move;
        cur.idle = Math.abs(steer) > 0.05 || dart !== 0 ? 0 : cur.idle + dt;
      }
      else sourceX -= steer * tun.steerRate() * dt + dart * tun.shiftStep();
      let pull: Emit['pull'];
      if (b.phase === 'river' && !salmon.active) {
        // the marker rides the water down the valley at (a damped) local flow speed, so it lingers where the river
        // pools and decides (lakes behind the ridges), then starts again at the spring once it reaches the coast
        let n = 0, vy = 0, cx = 0;
        for (let q = 0; q < water.n; q++) {
          const dx = water.x[q] - cur.x, dy = water.y[q] - cur.y;
          if (dy * dy < 16 && dx * dx < 144) { n++; vy += water.vy[q]; cx += water.x[q]; }
        }
        const v = n >= 3 ? clamp((vy / n) * 0.6, tun.currentMinSpeed(), tun.currentMaxSpeed()) : tun.currentMaxSpeed() * 0.5;
        cur.y += v * dt;
        // left alone for a while, the marker relaxes onto the water it's riding (so an idle rider doesn't drag the river)
        if (cur.idle > 4 && n >= 3) cur.x += clamp(cx / n - cur.x, -2 * dt, 2 * dt);
        cur.x = clamp(cur.x, 6, NX - 6);
        if (cur.y >= terrain.coastY - 3) { cur.y = 4; cur.x = sourceX; cur.passes++; cue('currentTop', { passes: cur.passes }, false); }
        if (cur.y < 12) sourceX = cur.x;
        pull = { x: cur.x, y: cur.y, r: tun.currentRows(), reach: 30, k: tun.currentK(), max: tun.currentMax() };
      } else { cur.y = 4; cur.x = sourceX; }
      sourceX = clamp(sourceX, 12, NX - 12);
      if (b.phase === 'river' || b.phase === 'salmon') flow = !flowing ? 0 : area ? raining : tun.flowPerFtp() * powerFrac * (boosting && b.phase === 'river' ? 1.5 : 1);

      const emit: Emit = {
        flow, area, sources: area ? undefined : [{ x: sourceX, share: springs[0].share }, ...springs.slice(1)],
        dropVol,
        speed: tun.speedLow() + (tun.speedHigh() - tun.speedLow()) * cadNorm,
        sourceX, spread: 1 + 3 * cadNorm,
        erodeMul: 1 + tun.bandBonus() * bonus,
        pull,
      };
      water.step(dt, emit, params());
      if (b.phase === 'river' || b.phase === 'salmon') for (const c of jobs.update(dt, { n: water.n, x: water.x, y: water.y, vx: water.vx, vy: water.vy, vol: water.vol }, water.w, nearW)) jobCue(c);
      t += dt;

      statAcc += dt;
      if (statAcc >= 1) {
        statAcc = 0; measure();
        if (salmon.active) salmon.updatePath(water.w);
        while (cutIdx < cutMarks.length && deepestCut >= cutMarks[cutIdx]) cue('gorge', { depth: cutMarks[cutIdx++] });
        while (deltaIdx < deltaMarks.length && delta >= deltaMarks[deltaIdx]) cue('deltaGrew', { volume: deltaMarks[deltaIdx++] });
        if (levelRun) {
          if (jobs.dam?.kind === 'log' && jobs.dam.broken && !lm.damBrokenAt) lm.damBrokenAt = lm.riverS;
          levelTick(false);
        }
      }
      if (!saved && t >= rideS) {
        saved = true; measure();
        if (plan[plan.length - 1].surge) settleSurge();
        levelTick(true);
        const prev = ctx.load<WatershedSave>() ?? {};
        const levels = levelRun ? { ...(prev.levels ?? {}), [levelRun.def.id]: Math.max(prev.levels?.[levelRun.def.id] ?? 0, levelRun.drops()) } : prev.levels;
        campaign = { drops: totalDrops(levels), cleared: levelsCleared(levels) };
        if (levelRun) cue('levelDone', { id: levelRun.def.id, n: levelRun.def.n, goal: levelRun.state === 'done', drops: levelRun.drops(), best: levels?.[levelRun.def.id] ?? 0, campaignDrops: campaign.drops });
        ctx.save({
          ...prev, ...(levels ? { levels } : {}),
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
      const b = planAt(t, scale, plan).block;
      const fish = salmon.active;
      const gateMode = !!levelDef?.tools?.includes('gate') && b.phase === 'river' && !fish;
      const label = { grind: 'Grind', spin: 'Spin', steady: b.phase === 'evaporate' ? 'Spin' : 'Steady', salmon: salmon.needLeap ? 'Leap: 95+' : 'Swim', free: 'Easy' }[b.style];
      const controls: NonNullable<GameHud['controls']> = [
        { button: 'paddles', label: b.phase === 'evaporate' ? 'Steer the vapor' : b.phase === 'cloud' || b.phase === 'rain' ? 'Steer the cloud' : fish ? 'Steer the school' : 'Steer the current', shortLabel: 'Steer' },
        { button: 'left', label: 'Steer left' }, { button: 'right', label: 'Steer right' }, { button: 'shiftersL', label: 'Dart left' }, { button: 'shiftersR', label: 'Dart right' },
        gateMode ? { button: 'a', label: 'Beaver gate: dam the saddle by the current', shortLabel: 'Gate', active: true } : { button: 'a', label: BOOST_LABEL[b.phase], shortLabel: b.phase === 'evaporate' ? 'Heat' : b.phase === 'rain' ? 'Burst' : BOOST_LABEL[b.phase], active: boostCd <= 0,
          cooldown: { fill: Math.max(0, 1 - boostCd / BOOST_CD), ready: boostCd <= 0 },
          ...(boostT > 0 ? { indicator: { status: 'Active' } } : {}) }, { button: 'y', label: view === 'follow' ? 'Overview' : 'Follow', shortLabel: view === 'follow' ? 'Map' : 'Follow' },
        { button: 'z', label: 'Look at a landmark', shortLabel: 'Look' },
      ];
      if (menu) return { gears: false, controls: [{ button: 'dpad', label: 'Choose a level (▲▼: Free Ride length)', shortLabel: 'Level' }, { button: 'y', label: skipWarmup ? 'Include warm-up' : 'Skip warm-up', shortLabel: 'Warm-up' }, { button: 'a', label: 'Start' }], playControls: controls };
      return {
        targetCadence: fish && salmon.needLeap ? { min: DEFAULT_SALMON.leapRpm, label } : b.rpm ? { ...b.rpm, label } : undefined,
        gears: false,
        controls,
      };
    },
    snapshot(): WatershedSnapshot {
      const at = planAt(t, scale, plan);
      return {
        t, over: t >= rideS,
        nx: terrain.nx, ny: terrain.ny, coastY: terrain.coastY, ridges: terrain.ridges,
        h: terrain.h, h0: terrain.h0, hard: terrain.hard, w: water.w,
        n: water.n, px: water.x, py: water.y, pvx: water.vx, pvy: water.vy, pvol: water.vol, psed: water.sed,
        version: water.version, sourceX,
        block: { index: at.index, name: at.block.name, hint: at.block.hint, style: at.block.style, left: at.blockLeft, ftp: at.ftp, rpm: at.block.rpm },
        blocks: plan.map((b) => ({ name: b.name, style: b.style, minutes: b.minutes * scale })),
        rideS, cadence, cadNorm, rpmLow: tun.rpmLow(), rpmHigh: tun.rpmHigh(), dropVol, inBand, bandBonus: bonus,
        carved, delta, deepestCut, toSea: water.stats.toSea, bandS,
        menu: menu ? {
          level: menuLevel, drops: campaign.drops, maxDrops: LEVELS.length * 3,
          levels: ENTRIES.map((id, k): MenuLevel => {
            const d = levelById(id), p = d ? levelPlan(d, skipWarmup) : makePlan(RIDE_LENGTHS[menuSel], skipWarmup);
            return { id, n: k + 1, name: d?.name ?? FREE_RIDE.name, blurb: d?.blurb ?? FREE_RIDE.blurb, goal: d?.goal.title ?? 'Every job, sea to sky to sea', bonus: d ? d.bonus.map((x) => x.label) : [],
              minutes: planMinutes(p), drops: d ? Math.min(3, prevSave.levels?.[id] ?? 0) : 0, locked: !isOpen(k), blocks: p.map((x) => ({ phase: x.phase, minutes: x.minutes })) };
          }),
          sel: menuSel, left: Math.max(0, 25 - menuT), skipWarmup,
          options: RIDE_LENGTHS.map((m) => { const p = makePlan(m, skipWarmup); return { length: m, minutes: planMinutes(p), blurb: RIDE_BLURB[m], blocks: p.map((b) => ({ phase: b.phase, minutes: b.minutes })) }; }),
        } : null,
        events: geo.events.map(({ edits, marks, ...e }) => (void edits, void marks, e)), mat: geo.mat,
        phase: at.block.phase, view, springs: [{ x: sourceX, share: springs[0].share }, ...springs.slice(1)], boost: { active: boostT > 0, ready: boostCd <= 0, cd: boostCd, total: BOOST_CD },
        sky: { vapor: sky.vapor, x: sky.x, y: sky.y, size: sky.size, radius: sky.radius, seaY: sky.seaY, inSun: sky.inSun, sun: sky.sun, puffs: sky.puffs, caught: sky.puffsCaught, rained: sky.rained, raining, springX: sky.springX() },
        jobs: {
          mills: jobs.mills, village: jobs.village, fields: jobs.fields, objective: jobs.objective ?? levelObjective(),
          dam: jobs.dam ? { kind: jobs.dam.kind, x: jobs.dam.x, y: jobs.dam.y, build: jobs.dam.build, height: jobs.dam.height, rate: jobs.dam.rate, health: jobs.dam.health, broken: jobs.dam.broken } : null,
          levee: jobs.levee ? jobs.levee.build : null,
        },
        level: levelRun && !menu ? levelRun.view(metrics()) : null,
        salmon: salmon.active ? salmonView() : null,
        cues,
        hooks: { cadence: salmon.active && salmon.needLeap ? 102 : bandMid(at.block) },
        look,
        current: at.block.phase === 'river' && !salmon.active && !menu ? { x: cur.x, y: cur.y, steering: cur.idle < 4 } : null,
      };
    },
    isOver: () => !menu && t >= rideS,
    inMenu: () => menu,
    receive(a: unknown) { if (pendingActions.length < 8 && a && typeof a === 'object') pendingActions.push(a as { type?: string; minutes?: number; skip?: boolean }); },
    summary() {
      measure();
      const banded = bandedS;
      return {
        score: score(),
        events: geo.events.filter((e) => e.state !== 'pending').map((e) => e.kind).join(' ') || 'none',
        objectives: jobs.objectivesDone, flour: Math.round(jobs.mills[0].output), planks: Math.round(jobs.mills[1].output),
        harvests: jobs.harvests, damsBroken: jobs.damsBroken, floodS: Math.round(jobs.village.floodS),
        vapor: Math.round(sky.vapor), cloudlets: sky.puffsCaught, rainfall: Math.round(sky.rained),
        carved: Math.round(carved), delta: Math.round(delta), deepestCut: +deepestCut.toFixed(1),
        toSea: Math.round(water.stats.toSea), minutesInBand: +(bandS / 60).toFixed(1),
        bandPct: Math.round((100 * bandS) / Math.max(1, banded)), blocks: lastBlock + 1, parcels: water.stats.spawned,
        salmonHome: salmon.home, salmonLost: salmon.lost,
        level: levelRun?.def.id ?? FREE_RIDE.id, levelGoal: levelRun?.state === 'done' ? 1 : 0, levelDrops: levelRun?.drops() ?? 0,
        campaignDrops: campaign.drops, levelsCleared: campaign.cleared,
        surgesHeld: lm.surgesHeld, drownedS: Math.round(jobs.drownedS),
      };
    },
    dispose() { ctx.resistance.clear('flow'); },
  };
  return sim;
}
