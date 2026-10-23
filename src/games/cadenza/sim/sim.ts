import type { GameContext, GameHud, GameSim, MediaTimeline, SectionKind } from '../../../contracts';
import { synthTimeline } from '../../../media/synth/queue';
import { extendTrack, buildTrack, COLOR_POINTS, DIFF, DIFFICULTIES, effortAt, ZONE_FLOOR, zoneIndexAt, type Difficulty, type Mode, type Phase, type Track } from './track';
import { rideIndexAt } from './ride';
import { advanceCoaching, freshCoaching, type Direction } from './coaching';
import { Announcements } from './announcements';
import { SHIPS, selectedShip, unlockedShips, type ShipId } from '../ships';

export type TrainerStyle = 'grade' | 'erg';
export interface CadenzaOpts { seed?: number; autopilot?: boolean; difficulty?: Difficulty; mode?: Mode; menu?: boolean; trainer?: TrainerStyle }
export interface CadenzaSave {
  ship?: ShipId;
  plays?: number; sets?: number; bestScore?: number; best?: Record<string, number>;
  lastDifficulty?: Difficulty; lastMode?: Mode; reducedFlash?: boolean; trainer?: TrainerStyle;
}
/** One finished song's recap. `strip` = effort per second: 0 on target, 1 under, 2 over, 3 recovering (no target). */
export interface SongRecap {
  n: number; title: string; artist: string; score: number; accuracyPct: number; maxChain: number;
  onTargetPct: number; launches: LaunchRating[]; strip: number[];
}
/** Chain counts that set off a flourish: 25, 50, then every 50. */
export const isChainMilestone = (c: number) => c === 25 || (c >= 50 && c % 50 === 0);
export interface Cue { id: number; type: string; data?: Record<string, number | string | boolean> }
/** Block states for the renderer: 0 ahead, 1 collected, 2 missed, 3 grey hit, 4 grey dodged. */
export const BLOCK = { AHEAD: 0, HIT: 1, MISS: 2, GREY_HIT: 3, GREY_DODGED: 4 } as const;
export type LaunchRating = 'perfect' | 'great' | 'good' | 'weak';
/** Launch ratio (avg power ÷ the sprint floor, or rpm ÷ 90 in ERG) needed per rating, and its bonus multiple. */
export const LAUNCH_RATINGS: ReadonlyArray<{ r: LaunchRating; min: number; x: number }> = [
  { r: 'perfect', min: 1.15, x: 3 }, { r: 'great', min: 1.0, x: 2 }, { r: 'good', min: 0.85, x: 1 }, { r: 'weak', min: -1, x: 0 },
];
export const rateLaunch = (ratio: number) => LAUNCH_RATINGS.find((x) => ratio >= x.min)!;

export interface CadenzaSnapshot {
  ship: ShipId;
  p: number; durationS: number; started: boolean; done: boolean;
  menu: { row: number; difficulty: Difficulty; mode: Mode; reducedFlash: boolean; trainer: TrainerStyle; left: number; ship: ShipId; ships: Array<{ id: ShipId; name: string; locked: boolean; hint: string }> } | null;
  track: Track; blockState: Uint8Array; x: number; lanes: number;
  score: number; mult: number; chain: number; shield: number; overdrive: boolean;
  dropout: { left: number } | null;
  /** The drop's launch roll: live meter while rolling, then the result for a few seconds. */
  launch: { active: boolean; progress: number; ratio: number; rating: LaunchRating | null; bonus: number; age: number } | null;
  zone: { index: number; n: number; kind: SectionKind; hue: number; left: number; label: string; floorFtp: number };
  /** The effort asked for right now: phase, the band's floor / ceiling watts (0 = none), seconds left in the phase. `min`/`max` = the band's zones. */
  effort: { ftp: number; ok: boolean; phase: Phase; watts: number; left: number; erg: boolean;
    instruction: string; countdown: number | null; min: number; max: number; transition: boolean; coaching: Direction;
    /** 0..1, eased: how far (and how long) the rider has been under the floor / over the zone's ceiling. Drives the fade and the overcharge. */
    under: number; over: number; ceilingWatts: number;
    /** For the track gauge: phase floor / ceiling as FTP fractions (0 = none) and rpm. */
    floorFtp: number; ceilingFtp: number; cadence: number };
  song: { title: string; artist: string; credit?: string } | null;
  difficulty: Difficulty; mode: Mode; reducedFlash: boolean;
  cues: Cue[];
  /** Finished songs, oldest first (the renderer shows the newest as a recap card). */
  recaps: SongRecap[];
  hooks: { powerFtp: number };
}

const MENU_ROWS = 6;
export const MENU = { mode: 0, difficulty: 1, trainer: 2, flash: 3, ship: 4, start: 5 } as const;
const MENU_AUTO_S = 25;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const FIXED = 1 / 30;
/** No off-target penalties in the first seconds of a ride (legs spinning up). */
const START_GRACE_S = 6;
/** Top of power zone z as an FTP fraction (Coggan); zone 5 tops out where 6 starts. */
const zoneCeiling = (z: number) => (z >= 5 ? 1.21 : ZONE_FLOOR[z + 1]);
const ease = (x: number, to: number, dt: number, tau: number) => x + (to - x) * (1 - Math.exp(-dt / tau));

export function createCadenzaSim(ctx: GameContext, opts: CadenzaOpts = {}): GameSim {
  const t = ctx.tuning;
  const tun = {
    hillScale: t.num('hillScale', 1, 0, 2, 0.05, 'Trainer grade × (builds climb up to 7 % at 1.0)'),
    maxGrade: t.num('maxGrade', 7, 2, 12, 0.5, 'Steepest build climb (%)'),
    recharge: t.num('shieldRecharge', 8, 1, 30, 1, 'Shield % per second while on target'),
    greyHit: t.num('greyHit', 20, 5, 60, 1, 'Shield lost per gray block'),
    rebootS: t.num('rebootS', 5, 1, 15, 0.5, 'Seconds on target to reboot after a dropout'),
    steer: t.num('steerRate', 9, 2, 30, 0.5, 'Lanes per second the craft can slide'),
    hitWindow: t.num('hitWindow', 0.55, 0.3, 1, 0.05, 'Lateral catch radius (lanes)'),
    underDrain: t.num('underDrain', 4, 0, 20, 0.5, 'Shield % per second drained while under the power target'),
    underGrace: t.num('underGraceS', 1.5, 0, 6, 0.25, 'Seconds under target before the shield starts draining'),
  };
  const save: CadenzaSave = { ...(ctx.load<CadenzaSave>() ?? {}) };
  let ship = selectedShip(ctx.profile);
  const availableShips = unlockedShips(ctx.profile);
  const cycleShip = (d: number) => { ship = availableShips[(availableShips.findIndex(s => s.id === ship) + d + availableShips.length) % availableShips.length].id; };
  const seed = opts.seed ?? 1;
  const timeline: MediaTimeline = ctx.media?.timeline ?? synthTimeline({ style: 'edm', songs: 1, seed });
  let difficulty: Difficulty = opts.difficulty ?? save.lastDifficulty ?? 'pro';
  let mode: Mode = 'mono'; // classic arrives in a later phase
  let reducedFlash = !!save.reducedFlash;
  let trainer: TrainerStyle = opts.trainer ?? save.trainer ?? 'grade';
  let menu = opts.menu !== false && !opts.autopilot && !opts.difficulty;
  let menuRow: number = MENU.start, menuT = 0;
  let track = buildTrack(timeline, { difficulty, mode, seed, maxGrade: tun.maxGrade() });
  let blockState = new Uint8Array(track.blocks.length);
  let revision = timeline.revision ?? 0;
  const announcements = new Announcements(ctx.media);
  announcements.setTrack(track, ctx.media?.positionS() ?? 0);

  let ownP = 0, started = false, done = false, saved = false;
  let x = 0, laneTarget = 0, holdDir = 0, holdT = 0, padLevel = 0, padActive = false, ergF = 0.6;
  let nextBlock = 0, score = 0, chain = 0, maxChain = 0, shield = 100, dropoutLeft = -1;
  let collected = 0, missed = 0, greysHit = 0, greysDodged = 0, dropouts = 0, overdriveS = 0, cleanZones = 0;
  let zoneIdx = -1, zoneClean = true, zoneBlocks = 0, zoneOd = 0, zoneDur = 0, dropsHeld = 0, drops = 0, songsDone = 0;
  let ok = false, overdrive = false, ftp = 0, zoneSprint = 0;
  let under = 0, over = 0, underS = 0, ceiling = 0, underDrainS = 0, cadence = 0;
  let coaching = freshCoaching(), effortIdx = -1, trainerGrade = 0;
  let nextLaunch = 0, launchSum = 0, launchT = 0, launchActive = false, launchResult: { rating: LaunchRating; bonus: number; ratio: number; at: number } | null = null;
  let launches = 0, perfectLaunches = 0, launchBonus = 0;
  const recaps: SongRecap[] = [];
  const freshSong = () => ({ score0: score, collected: 0, missed: 0, maxChain: 0, chain0: chain, launches: [] as LaunchRating[], strip: [] as number[], t: 0, onS: 0, targetS: 0 });
  let song = { score0: 0, collected: 0, missed: 0, maxChain: 0, chain0: 0, launches: [] as LaunchRating[], strip: [] as number[], t: 0, onS: 0, targetS: 0 };
  const closeSong = (k: number) => {
    const meta = timeline.songs[k], total = song.collected + song.missed;
    recaps.push({
      n: k + 1, title: meta?.title ?? '', artist: meta?.artist ?? '', score: score - song.score0,
      accuracyPct: total ? Math.round((100 * song.collected) / total) : 0, maxChain: song.maxChain,
      onTargetPct: song.targetS ? Math.round((100 * song.onS) / song.targetS) : 100, launches: song.launches, strip: song.strip,
    });
    song = freshSong();
  };
  const launchList = () => track.stunts.filter((x) => x.kind === 'launch');
  const cues: Cue[] = []; let cueId = 0;
  const cue = (type: string, data?: Cue['data'], emit = true) => {
    cues.push({ id: ++cueId, type, ...(data ? { data } : {}) }); if (cues.length > 24) cues.shift();
    if (emit) ctx.emit({ type, ...(data ? { data } : {}) });
  };
  const position = () => (ctx.media ? ctx.media.positionS() : ownP);
  const half = () => (track.lanes - 1) / 2;
  const mult = () => (dropoutLeft >= 0 ? 1 : Math.min(4, 1 + Math.floor(chain / 8) * 0.5)) * (overdrive ? 2 : 1);

  const startRide = () => {
    menu = false;
    track = buildTrack(timeline, { difficulty, mode, seed, maxGrade: tun.maxGrade() });
    announcements.setTrack(track, position());
    blockState = new Uint8Array(track.blocks.length);
    save.lastDifficulty = difficulty; save.lastMode = mode; save.reducedFlash = reducedFlash; save.trainer = trainer; save.ship = ship; ctx.save(save);
    ctx.resistance.useVirtualGears(true);
  };
  if (!menu) startRide();

  const closeZone = () => {
    if (zoneIdx < 0) return;
    const z = track.zones[zoneIdx];
    if (zoneClean && zoneBlocks >= 6) { cleanZones++; score += 250 * z.n; cue('cleanZone', { n: z.n, bonus: 250 * z.n }); }
    if (z.kind === 'drop' && zoneSprint > 0) { drops++; if (zoneOd / zoneSprint >= 0.7) { dropsHeld++; cue('dropHeld', { n: z.n }); } }
  };

  const steer = () => {
    const inp = ctx.input();
    const h = half();
    if (opts.autopilot) {
      // head for the next coloured block; if a grey comes first and sits on our line, side-step it
      const p = position();
      const nb = track.blocks[nextBlock];
      let want = laneTarget;
      const nextColour = track.blocks.slice(nextBlock, nextBlock + 8).find((b) => b.color >= 0 && b.t < p + 1.5);
      if (nextColour) want = nextColour.lane;
      if (nb && nb.color < 0 && nb.t < p + 0.6 && Math.abs(nb.lane - (nb.t - p < 0.15 ? x : want)) <= tun.hitWindow()) {
        const away = [nb.lane - 1, nb.lane + 1].filter((l) => l >= -h && l <= h);
        want = away.sort((a, b) => Math.abs(a - want) - Math.abs(b - want))[0];
      }
      laneTarget = want;
      return;
    }
    // Paddles = absolute position: the stronger paddle leads (left pulls left, right pulls right); how far you pull picks
    // the lane (with hysteresis); letting both rest returns you to the centre. While both rest, the D-pad and Z/A step
    // one lane per press (holding repeats).
    const l = Math.abs(inp.paddleL), r = Math.abs(inp.paddleR);
    if (l > 0.05 || r > 0.05) {
      const v = l >= r ? -l : r, mag = Math.abs(v);
      let level = 0;
      for (let k = 1; k <= h; k++) {
        const on = 0.3 + ((k - 1) * 0.7) / h, held = Math.abs(padLevel) >= k;
        if (mag >= (held ? on - 0.08 : on)) level = k;
      }
      padLevel = Math.sign(v) * level;
      laneTarget = padLevel; padActive = true; holdDir = 0;
      return;
    }
    if (padActive) { padActive = false; padLevel = 0; laneTarget = 0; }
    let step = 0;
    if (inp.pressed.has('left') || inp.pressed.has('z')) step = -1;
    if (inp.pressed.has('right') || inp.pressed.has('a')) step = 1;
    const heldDir = (inp.held.has('right') || inp.held.has('a') ? 1 : 0) - (inp.held.has('left') || inp.held.has('z') ? 1 : 0);
    if (step) { holdDir = step; holdT = -0.3; } // first repeat after 0.3 s, then every 0.15 s
    else if (heldDir && heldDir === holdDir) { holdT += FIXED; if (holdT >= 0.15) { holdT = 0; step = heldDir; } }
    else holdDir = 0;
    if (step) laneTarget = clamp(Math.round(laneTarget) + step, -h, h);
  };

  const updateMenu = (dt: number) => {
    const inp = ctx.input();
    let go = false;
    if (inp.pressed.has('up')) menuRow = (menuRow + MENU_ROWS - 1) % MENU_ROWS;
    if (inp.pressed.has('down')) menuRow = (menuRow + 1) % MENU_ROWS;
    const dir = (inp.pressed.has('right') || inp.pressed.has('shiftUpR') ? 1 : 0) - (inp.pressed.has('left') || inp.pressed.has('shiftUpL') ? 1 : 0);
    const change = (row: number, d: number) => {
      if (row === MENU.difficulty) difficulty = DIFFICULTIES[(DIFFICULTIES.indexOf(difficulty) + d + 3) % 3];
      if (row === MENU.trainer) trainer = trainer === 'grade' ? 'erg' : 'grade';
      if (row === MENU.flash) reducedFlash = !reducedFlash;
      if (row === MENU.ship) cycleShip(d);
      menuT = 0;
    };
    if (dir) { change(menuRow, dir); cue('menuMove', undefined, false); }
    if (inp.pressed.has('a')) { if (menuRow === MENU.start || menuRow === MENU.mode) go = true; else change(menuRow, 1); }
    for (const a of actions.splice(0)) {
      if (a.type === 'difficulty' && DIFFICULTIES.includes(a.value as Difficulty)) difficulty = a.value as Difficulty;
      if (a.type === 'trainer') trainer = trainer === 'grade' ? 'erg' : 'grade';
      if (a.type === 'flash') reducedFlash = !reducedFlash;
      if (a.type === 'ship') {
        if (typeof a.value === 'string' && availableShips.some(s => s.id === a.value)) ship = a.value as ShipId;
        else if (a.value == null) cycleShip(1);
      }
      if (a.type === 'start') go = true;
      menuT = 0;
    }
    menuT += dt;
    if (go || menuT >= MENU_AUTO_S) startRide();
  };
  const actions: Array<{ type: string; value?: unknown }> = [];
  const launchProgress = (p: number) => { const L = launchList()[nextLaunch]; return L ? clamp((p - L.t0) / (L.t1 - L.t0), 0, 1) : 0; };
  let lastEffort = effortAt(track, 0, difficulty);

  return {
    receive(a: unknown) { if (a && typeof a === 'object' && 'type' in a) actions.push(a as { type: string; value?: unknown }); },
    update(dt) {
      if ((timeline.revision ?? 0) !== revision) {
        const next = buildTrack(timeline, { difficulty, mode, seed, maxGrade: tun.maxGrade() });
        // Ahead-only commits: the engine holds the clock before the analyzed horizon is exhausted.
        const from = Math.max(announcements.untilS, timeline.frozenUntilS ?? 0,
          started ? timeline.updateFromS ?? (timeline.frozenUntilS === undefined ? position() + 35 : 0) : 0,
          started && timeline.frozenUntilS === undefined ? position() + 3 : 0);
        const previous = blockState;
        track = extendTrack(track, next, from);
        announcements.setTrack(track, position());
        blockState = new Uint8Array(track.blocks.length);
        const kept = started ? track.blocks.filter((b) => b.t < from).length : 0;
        blockState.set(previous.subarray(0, Math.min(kept, blockState.length)));
        revision = timeline.revision ?? 0; timeline.updateFromS = undefined;
      }
      if (menu) { updateMenu(dt); return; }
      if (!ctx.media) ownP += dt;
      const p = position();
      if (!started && (ctx.media ? ctx.media.started() : true)) { started = true; cue('start'); }
      announcements.show(p);
      const bike = ctx.bike();

      // zone bookkeeping
      const zi = zoneIndexAt(track, p), z = track.zones[zi];
      if (zi !== zoneIdx) {
        closeZone();
        zoneIdx = zi; zoneClean = true; zoneBlocks = 0; zoneOd = 0; zoneDur = 0; zoneSprint = 0;
        cue('zone', { n: z.n, kind: z.kind });
      }
      for (let s = songsDone; s < timeline.songs.length; s++) if (p >= timeline.songs[s].t1 - 0.05) { closeSong(s); songsDone = s + 1; cue('songDone', { n: songsDone }); }

      // effort: power targets (sections are too short for HR); ERG holds the watts so pedalling is enough
      const e = effortAt(track, p, difficulty);
      const ei = rideIndexAt(track.rideBlocks, p);
      if (ei !== effortIdx) { effortIdx = ei; coaching = freshCoaching(); cue('effort', { phase: e.phase }); }
      ftp = bike.ftpFraction; cadence = bike.cadence3s;
      const erg = trainer === 'erg';
      ok = e.phase === 'recover' || (erg ? bike.cadence3s >= 55 : bike.ftpFraction >= e.floorFtp - 0.02);
      const wasOd = overdrive;
      overdrive = e.phase === 'sprint' && ok && dropoutLeft < 0;
      if (overdrive && !wasOd) cue('overdrive', undefined, false);
      // off target: under fades the world (and drains the shield after a grace), over overcharges the ship
      ceiling = erg || e.target.max === 5 ? 0 : zoneCeiling(e.target.max);
      const short = !ok && p > START_GRACE_S ? clamp((e.floorFtp - ftp) / Math.max(0.1, e.floorFtp) / 0.15, 0.35, 1) : 0;
      const hot = ceiling && ftp > ceiling + 0.03 ? clamp((ftp - ceiling) / 0.15, 0.35, 1) : 0;
      under = ease(under, short, dt, short > under ? 1.2 : 0.35);
      over = ease(over, hot, dt, hot > over ? 1.5 : 0.6);
      underS = ok ? 0 : underS + dt;
      coaching = advanceCoaching(coaching, e.countdown || e.transition ? null : !ok ? 'harder' : hot ? 'easier' : null, dt);
      zoneDur += dt; if (e.phase === 'sprint') zoneSprint += dt;
      if (overdrive) { zoneOd += dt; overdriveS += dt; }
      lastEffort = e;

      // launches: the drop's block-free roll — punch it; average effort over the roll is rated and paid out
      const ls = launchList(), L = ls[nextLaunch];
      launchActive = !!L && p >= L.t0 && p < L.t1;
      if (launchActive) { launchSum += (erg ? bike.cadence3s / 90 : ftp / Math.max(0.3, e.floorFtp)) * dt; launchT += dt; }
      if (L && p >= L.t1) {
        const ratio = launchT > 0 ? launchSum / launchT : 0, rt = rateLaunch(ratio), z = track.zones[L.zone];
        const bonus = dropoutLeft >= 0 ? 0 : Math.round(500 * rt.x * (1 + 0.1 * (z.n - 1)));
        score += bonus; launches++; launchBonus += bonus; if (rt.r === 'perfect') perfectLaunches++;
        launchResult = { rating: rt.r, bonus, ratio, at: p };
        cue('launch', { rating: rt.r, bonus, ratio: Math.round(ratio * 100) / 100 }); song.launches.push(rt.r);
        nextLaunch++; launchSum = 0; launchT = 0;
      }

      // per-song effort strip (1 Hz) and time on target
      const code = e.phase === 'recover' ? 3 : under > 0.25 ? 1 : over > 0.3 ? 2 : 0;
      song.t += dt; if (e.phase !== 'recover') { song.targetS += dt; if (ok) song.onS += dt; }
      if (song.t >= song.strip.length + 1) song.strip.push(code);

      // shield and dropouts
      if (dropoutLeft >= 0) {
        dropoutLeft = ok ? dropoutLeft - dt : tun.rebootS();
        if (dropoutLeft <= 0) { dropoutLeft = -1; shield = 50; cue('reboot'); }
      } else if (ok) shield = Math.min(100, shield + tun.recharge() * dt);
      else if (underS > tun.underGrace() && p > START_GRACE_S) {
        shield -= tun.underDrain() * Math.max(0.35, under) * dt; underDrainS += dt;
        if (shield <= 0) { shield = 0; dropoutLeft = tun.rebootS(); dropouts++; cue('dropout'); }
      }

      // trainer: the track's grade (difficulty and gears are applied by the mixer), or ERG at the phase's watts (eased)
      if (trainer === 'erg') {
        ergF += (lastEffort.ergFtp - ergF) * (1 - Math.exp(-dt / 2.5));
        ctx.resistance.set({ id: 'track', mode: 'erg', ftpFraction: Math.round(ergF * 100) / 100 });
      } else {
        trainerGrade = ease(trainerGrade, e.gradePct * tun.hillScale(), dt, e.phase === 'recover' ? 1 : 2.5);
        ctx.resistance.set({ id: 'track', mode: 'sim', gradePct: trainerGrade });
      }

      // steering
      steer();
      const h = half();
      x += clamp(laneTarget - x, -tun.steer() * dt, tun.steer() * dt);
      x = clamp(x, -h, h);

      // blocks reaching the craft
      while (nextBlock < track.blocks.length && track.blocks[nextBlock].t <= p) {
        const b = track.blocks[nextBlock];
        const caught = Math.abs(b.lane - x) <= tun.hitWindow();
        if (b.zone === zoneIdx) zoneBlocks++;
        if (b.color >= 0) {
          if (caught) {
            chain++; maxChain = Math.max(maxChain, chain); collected++; song.collected++; song.maxChain = Math.max(song.maxChain, chain);
            if (isChainMilestone(chain)) cue('chain', { n: chain }, false);
            score += Math.round(COLOR_POINTS[b.color] * mult());
            blockState[nextBlock] = BLOCK.HIT;
          } else { missed++; song.missed++; zoneClean = false; blockState[nextBlock] = BLOCK.MISS; }
        } else if (caught) {
          if (chain >= 25) cue('chainBreak', { n: chain }, false);
          greysHit++; chain = 0; zoneClean = false; blockState[nextBlock] = BLOCK.GREY_HIT; cue('grey', undefined, false);
          if (dropoutLeft < 0) {
            shield -= tun.greyHit();
            if (shield <= 0) { shield = 0; dropoutLeft = tun.rebootS(); dropouts++; cue('dropout'); }
          }
        } else { greysDodged++; blockState[nextBlock] = BLOCK.GREY_DODGED; }
        nextBlock++;
      }

      if (!done && p >= track.durationS - 0.05) {
        done = true; closeZone(); cue('setDone', { songs: timeline.songs.length });
      }
      if (done && !saved) {
        saved = true;
        const key = `${timeline.songs.map((s) => s.id).join('+')}|${mode}|${difficulty}`;
        const best = { ...(save.best ?? {}) };
        if (score > (best[key] ?? 0)) { best[key] = score; cue('newBest', { score }); }
        Object.assign(save, { best, plays: (save.plays ?? 0) + 1, sets: (save.sets ?? 0) + (timeline.songs.length >= 5 ? 1 : 0), bestScore: Math.max(save.bestScore ?? 0, score) });
        ctx.save(save);
      }
      ctx.debug('ws.p', +p.toFixed(2)); ctx.debug('ws.zone', `${z.n} ${z.kind}`); ctx.debug('ws.shield', Math.round(shield));
    },
    hud(): GameHud {
      if (menu) return { gears: false, controls: [{ button: 'dpad', label: 'Choose' }, { button: 'a', label: 'Select / Start', shortLabel: 'Start' }] };
      const e = lastEffort, erg = trainer === 'erg';
      return {
        targetZone: { ...e.target, label: `${e.target.label}${erg ? ' (ERG)' : ''}` }, gears: !erg,
        controls: [
          { button: 'dpad', label: '◀▶ Lane' }, { button: 'z', label: 'Left' }, { button: 'a', label: 'Right' }, { button: 'paddles', label: 'Lane' },
          ...(erg ? [] : [{ button: 'shiftersL' as const, label: 'Gears' }, { button: 'shiftersR' as const, label: 'Gears' }]),
        ],
      };
    },
    snapshot(): CadenzaSnapshot {
      const p = position(), zi = Math.max(0, zoneIdx < 0 ? zoneIndexAt(track, p) : zoneIdx), z = track.zones[zi];
      if (!menu) announcements.show(p);
      const song = timeline.songs.find((s) => p >= s.t0 && p < s.t1) ?? timeline.songs[0];
      return {
        p, durationS: track.durationS, started, done,
        ship,
        menu: menu ? { row: menuRow, difficulty, mode, reducedFlash, trainer, ship, ships: SHIPS.map(s => ({ id: s.id, name: s.name, locked: !availableShips.some(a => a.id === s.id), hint: s.hint })), left: Math.max(0, MENU_AUTO_S - menuT) } : null,
        track, blockState, x, lanes: track.lanes,
        score, mult: mult(), chain, shield, overdrive, dropout: dropoutLeft >= 0 ? { left: dropoutLeft } : null,
        launch: launchActive
          ? { active: true, progress: launchProgress(p), ratio: launchT > 0 ? launchSum / launchT : 0, rating: null, bonus: 0, age: 0 }
          : launchResult && p - launchResult.at < 3 ? { active: false, progress: 1, ratio: launchResult.ratio, rating: launchResult.rating, bonus: launchResult.bonus, age: p - launchResult.at } : null,
        zone: { index: zi, n: z.n, kind: z.kind, hue: z.hue, left: Math.max(0, z.t1 - p), label: z.target.label ?? '', floorFtp: z.floorFtp },
        effort: {
          ftp, ok, phase: lastEffort.phase, watts: lastEffort.phase === 'recover' ? 0 : Math.round(ZONE_FLOOR[lastEffort.band.min] * ctx.profile.ftp), left: lastEffort.left, erg: trainer === 'erg',
          instruction: lastEffort.countdown ? String(lastEffort.countdown) : coaching.direction === 'harder' ? trainer === 'erg' ? 'Keep Spinning' : 'Harder'
            : coaching.direction === 'easier' ? 'Ease Off' : trainer === 'erg' && lastEffort.instruction === 'Harder' ? 'Keep Spinning' : lastEffort.instruction,
          countdown: lastEffort.countdown, min: lastEffort.band.min, max: lastEffort.band.max, transition: lastEffort.transition,
          coaching: lastEffort.countdown || lastEffort.transition ? null : coaching.direction,
          under, over, ceilingWatts: trainer === 'erg' || lastEffort.band.max >= 5 ? 0 : Math.round(zoneCeiling(lastEffort.band.max) * ctx.profile.ftp),
          floorFtp: lastEffort.phase === 'recover' ? 0 : lastEffort.floorFtp, ceilingFtp: ceiling, cadence: Math.round(cadence),
        },
        song: song ? { title: song.title, artist: song.artist, ...(song.credit ? { credit: song.credit.text } : {}) } : null,
        difficulty, mode, reducedFlash, cues, recaps,
        // The fake rider prepares during the countdown, just as a rider can now do without an over-power warning.
        hooks: { powerFtp: lastEffort.countdown ? ZONE_FLOOR[DIFF[difficulty].dropZone] + 0.03
          : lastEffort.phase === 'recover' ? 0.5 : lastEffort.floorFtp + 0.03 },
      };
    },
    isOver: () => !menu && done,
    inMenu: () => menu,
    summary() {
      const total = collected + missed;
      return {
        score, collected, missed, accuracyPct: total ? Math.round((100 * collected) / total) : 0, maxChain,
        greysHit, greysDodged, dropouts, cleanZones, drops, dropsHeld, overdriveS: Math.round(overdriveS), underDrainS: Math.round(underDrainS),
        launches, perfectLaunches, launchBonus,
        zones: Math.max(0, zoneIdx + 1), songs: timeline.songs.length, songsDone, difficulty, mode, trainer,
      };
    },
  };
}
