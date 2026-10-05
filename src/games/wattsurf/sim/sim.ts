import type { GameContext, GameHud, GameSim, MediaTimeline, SectionKind } from '../../../contracts';
import { synthTimeline } from '../../../media/synth/queue';
import { buildTrack, COLOR_POINTS, DIFFICULTIES, sampleAt, zoneIndexAt, type Difficulty, type Mode, type Track } from './track';

export interface WattsurfOpts { seed?: number; autopilot?: boolean; difficulty?: Difficulty; mode?: Mode; menu?: boolean }
export interface WattsurfSave {
  plays?: number; sets?: number; bestScore?: number; best?: Record<string, number>;
  lastDifficulty?: Difficulty; lastMode?: Mode; reducedFlash?: boolean;
}
export interface Cue { id: number; type: string; data?: Record<string, number | string | boolean> }
/** Block states for the renderer: 0 ahead, 1 collected, 2 missed, 3 grey hit, 4 grey dodged. */
export const BLOCK = { AHEAD: 0, HIT: 1, MISS: 2, GREY_HIT: 3, GREY_DODGED: 4 } as const;

export interface WattsurfSnapshot {
  p: number; durationS: number; started: boolean; done: boolean;
  menu: { row: number; difficulty: Difficulty; mode: Mode; reducedFlash: boolean; left: number } | null;
  track: Track; blockState: Uint8Array; x: number; lanes: number;
  score: number; mult: number; chain: number; shield: number; overdrive: boolean;
  dropout: { left: number } | null;
  zone: { index: number; n: number; kind: SectionKind; hue: number; left: number; label: string; floorFtp: number };
  effort: { ftp: number; ok: boolean };
  song: { title: string; artist: string; credit?: string } | null;
  difficulty: Difficulty; mode: Mode; reducedFlash: boolean;
  cues: Cue[];
  hooks: { powerFtp: number };
}

const MENU_ROWS = 4; // mode, difficulty, reduced flashing, start
const MENU_AUTO_S = 25;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

export function createWattsurfSim(ctx: GameContext, opts: WattsurfOpts = {}): GameSim {
  const t = ctx.tuning;
  const tun = {
    hillScale: t.num('hillScale', 1, 0, 2, 0.05, 'Trainer grade × (builds climb up to 7 % at 1.0)'),
    maxGrade: t.num('maxGrade', 7, 2, 12, 0.5, 'Steepest build climb (%)'),
    recharge: t.num('shieldRecharge', 8, 1, 30, 1, 'Shield % per second while on target'),
    greyHit: t.num('greyHit', 20, 5, 60, 1, 'Shield lost per grey block'),
    rebootS: t.num('rebootS', 5, 1, 15, 0.5, 'Seconds on target to reboot after a dropout'),
    steer: t.num('steerRate', 9, 2, 30, 0.5, 'Lanes per second the craft can slide'),
    hitWindow: t.num('hitWindow', 0.55, 0.3, 1, 0.05, 'Lateral catch radius (lanes)'),
  };
  const save: WattsurfSave = { ...(ctx.load<WattsurfSave>() ?? {}) };
  const seed = opts.seed ?? 1;
  const timeline: MediaTimeline = ctx.media?.timeline ?? synthTimeline({ style: 'edm', songs: 1, seed });
  let difficulty: Difficulty = opts.difficulty ?? save.lastDifficulty ?? 'pro';
  let mode: Mode = 'mono'; // classic arrives in a later phase
  let reducedFlash = !!save.reducedFlash;
  let menu = opts.menu !== false && !opts.autopilot && !opts.difficulty;
  let menuRow = 3, menuT = 0;
  let track = buildTrack(timeline, { difficulty, mode, seed, maxGrade: tun.maxGrade() });
  let blockState = new Uint8Array(track.blocks.length);

  let ownP = 0, started = false, done = false, saved = false;
  let x = 0, laneTarget = 0, usePaddles = false;
  let nextBlock = 0, score = 0, chain = 0, maxChain = 0, shield = 100, dropoutLeft = -1;
  let collected = 0, missed = 0, greysHit = 0, greysDodged = 0, dropouts = 0, overdriveS = 0, cleanZones = 0;
  let zoneIdx = -1, zoneClean = true, zoneBlocks = 0, zoneOd = 0, zoneDur = 0, dropsHeld = 0, drops = 0, songsDone = 0;
  let ok = false, overdrive = false, ftp = 0;
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
    blockState = new Uint8Array(track.blocks.length);
    save.lastDifficulty = difficulty; save.lastMode = mode; save.reducedFlash = reducedFlash; ctx.save(save);
    ctx.resistance.useVirtualGears(true);
  };
  if (!menu) startRide();

  const closeZone = () => {
    if (zoneIdx < 0) return;
    const z = track.zones[zoneIdx];
    if (zoneClean && zoneBlocks >= 6) { cleanZones++; score += 250 * z.n; cue('cleanZone', { n: z.n, bonus: 250 * z.n }); }
    if (z.kind === 'drop') { drops++; if (zoneDur > 0 && zoneOd / zoneDur >= 0.7) { dropsHeld++; cue('dropHeld', { n: z.n }); } }
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
      laneTarget = want; usePaddles = false;
      return;
    }
    const pad = inp.paddleR - inp.paddleL;
    if (Math.abs(pad) > 0.12) { usePaddles = true; laneTarget = clamp(pad * h * 1.15, -h, h); }
    else if (usePaddles) { usePaddles = false; laneTarget = Math.round(x); }
    if (inp.pressed.has('left')) { usePaddles = false; laneTarget = clamp(Math.round(laneTarget) - 1, -h, h); }
    if (inp.pressed.has('right')) { usePaddles = false; laneTarget = clamp(Math.round(laneTarget) + 1, -h, h); }
  };

  const updateMenu = (dt: number) => {
    const inp = ctx.input();
    let go = false;
    if (inp.pressed.has('up')) menuRow = (menuRow + MENU_ROWS - 1) % MENU_ROWS;
    if (inp.pressed.has('down')) menuRow = (menuRow + 1) % MENU_ROWS;
    const dir = (inp.pressed.has('right') || inp.pressed.has('shiftUpR') ? 1 : 0) - (inp.pressed.has('left') || inp.pressed.has('shiftUpL') ? 1 : 0);
    if (dir) {
      if (menuRow === 1) difficulty = DIFFICULTIES[clamp(DIFFICULTIES.indexOf(difficulty) + dir, 0, DIFFICULTIES.length - 1)];
      if (menuRow === 2) reducedFlash = !reducedFlash;
      cue('menuMove', undefined, false); menuT = 0;
    }
    if (inp.pressed.has('a')) { if (menuRow === 2) { reducedFlash = !reducedFlash; menuT = 0; } else if (menuRow === 1) { difficulty = DIFFICULTIES[(DIFFICULTIES.indexOf(difficulty) + 1) % 3]; menuT = 0; } else go = true; }
    for (const a of actions.splice(0)) {
      if (a.type === 'difficulty' && DIFFICULTIES.includes(a.value as Difficulty)) difficulty = a.value as Difficulty;
      if (a.type === 'flash') reducedFlash = !reducedFlash;
      if (a.type === 'start') go = true;
      menuT = 0;
    }
    menuT += dt;
    if (go || menuT >= MENU_AUTO_S) startRide();
  };
  const actions: Array<{ type: string; value?: unknown }> = [];

  return {
    receive(a: unknown) { if (a && typeof a === 'object' && 'type' in a) actions.push(a as { type: string; value?: unknown }); },
    update(dt) {
      if (menu) { updateMenu(dt); return; }
      if (!ctx.media) ownP += dt;
      const p = position();
      if (!started && (ctx.media ? ctx.media.started() : true)) { started = true; cue('start'); }
      const bike = ctx.bike();

      // zone bookkeeping
      const zi = zoneIndexAt(track, p), z = track.zones[zi];
      if (zi !== zoneIdx) {
        closeZone();
        zoneIdx = zi; zoneClean = true; zoneBlocks = 0; zoneOd = 0; zoneDur = 0;
        cue('zone', { n: z.n, kind: z.kind });
      }
      for (let s = songsDone; s < timeline.songs.length; s++) if (p >= timeline.songs[s].t1 - 0.05) { songsDone = s + 1; cue('songDone', { n: songsDone }); }

      // effort: short efforts on power, long holds on the rider's effort zone (HR-aware)
      ftp = bike.ftpFraction;
      ok = z.target.source === 'power' ? bike.powerZone >= z.target.min : bike.effortZone >= z.target.min;
      if (z.target.min <= 1) ok = true;
      const wasOd = overdrive;
      overdrive = z.kind === 'drop' && ok && dropoutLeft < 0;
      if (overdrive && !wasOd) cue('overdrive', undefined, false);
      zoneDur += dt; if (overdrive) { zoneOd += dt; overdriveS += dt; }

      // shield and dropouts
      if (dropoutLeft >= 0) {
        dropoutLeft = ok ? dropoutLeft - dt : tun.rebootS();
        if (dropoutLeft <= 0) { dropoutLeft = -1; shield = 50; cue('reboot'); }
      } else if (ok) shield = Math.min(100, shield + tun.recharge() * dt);

      // trainer: the track's grade (difficulty and gears are applied by the mixer)
      ctx.resistance.set({ id: 'track', mode: 'sim', gradePct: sampleAt(track.grade, track.hz, p) * tun.hillScale() });

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
            chain++; maxChain = Math.max(maxChain, chain); collected++;
            score += Math.round(COLOR_POINTS[b.color] * mult());
            blockState[nextBlock] = BLOCK.HIT;
          } else { missed++; zoneClean = false; blockState[nextBlock] = BLOCK.MISS; }
        } else if (caught) {
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
      if (menu) return { gears: false, controls: [{ button: 'dpad', label: 'Choose' }, { button: 'a', label: 'Select / Start' }] };
      const z = track.zones[Math.max(0, zoneIdx)];
      return {
        targetZone: z.target, gears: true,
        controls: [
          { button: 'paddles', label: 'Steer' }, { button: 'dpad', label: '◀▶ Lane' },
          { button: 'shiftersL', label: 'Gears' }, { button: 'shiftersR', label: 'Gears' },
        ],
      };
    },
    snapshot(): WattsurfSnapshot {
      const p = position(), zi = Math.max(0, zoneIdx < 0 ? zoneIndexAt(track, p) : zoneIdx), z = track.zones[zi];
      const song = timeline.songs.find((s) => p >= s.t0 && p < s.t1) ?? timeline.songs[0];
      return {
        p, durationS: track.durationS, started, done,
        menu: menu ? { row: menuRow, difficulty, mode, reducedFlash, left: Math.max(0, MENU_AUTO_S - menuT) } : null,
        track, blockState, x, lanes: track.lanes,
        score, mult: mult(), chain, shield, overdrive, dropout: dropoutLeft >= 0 ? { left: dropoutLeft } : null,
        zone: { index: zi, n: z.n, kind: z.kind, hue: z.hue, left: Math.max(0, z.t1 - p), label: z.target.label ?? '', floorFtp: z.floorFtp },
        effort: { ftp, ok },
        song: song ? { title: song.title, artist: song.artist, ...(song.credit ? { credit: song.credit.text } : {}) } : null,
        difficulty, mode, reducedFlash, cues,
        hooks: { powerFtp: z.target.min <= 1 ? 0.5 : z.floorFtp + 0.03 },
      };
    },
    isOver: () => !menu && done,
    inMenu: () => menu,
    summary() {
      const total = collected + missed;
      return {
        score, collected, missed, accuracyPct: total ? Math.round((100 * collected) / total) : 0, maxChain,
        greysHit, greysDodged, dropouts, cleanZones, drops, dropsHeld, overdriveS: Math.round(overdriveS),
        zones: Math.max(0, zoneIdx + 1), songs: timeline.songs.length, songsDone, difficulty, mode,
      };
    },
  };
}
