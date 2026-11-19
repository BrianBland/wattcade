import type { GameContext, GameSim } from '../../../contracts';
import {
  chassis,
  recover,
  crossDeck,
  deck,
  forkWidth,
  narrowWidth,
  safeLine,
  rampLine,
  packPace,
  prize,
  salvage,
  LAUNCH_SPEED,
} from './deck';
import { LAP, WIDTH, track } from './track';
export { LAP };
export const FINISH = LAP * 3;
export const classes = ['Rookie', 'Hotshot', 'Outlaw'] as const;
export const pilots = ['Rivet', 'Mantis', 'Switch'];
export const pads = [78, 334, 375, 536, 729, 931].map((at, i) => ({
  at,
  x: [-0.78, 0.52, 0.82, -0.62, 0.15, -0.92][i],
}));
export type Rival = ReturnType<typeof chassis> & {
  at: number;
  x: number;
  lean: number;
  stun: number;
  windup: number;
  strike: number;
  side: number;
  cooldown: number;
  finish: number | null;
};
export const SWING = 0.48;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
export function inReach(gap: number, across: number, side: number) {
  return Math.abs(gap) < 3.8 && across * side > 0.05 && across * side < 0.88;
}
// The same moving tip drives both the rendered links and the contact test.
export function chainTip(phase: number, side: number) {
  const reach = 0.7 + 3.25 * Math.sin(Math.PI * phase),
    angle = -1.55 + phase * 3.1;
  return { x: side * (0.47 + Math.cos(angle) * reach), z: 0.36 + Math.sin(angle) * reach };
}
export function swingConnects(gap: number, across: number, side: number, phase: number) {
  if (!inReach(gap, across, side)) return false;
  const tip = chainTip(phase, side),
    dx = across * WIDTH,
    dz = -gap;
  const t = clamp((dx * tip.x + dz * tip.z) / (tip.x * tip.x + tip.z * tip.z), 0, 1);
  return Math.hypot(dx - t * tip.x, (dz - t * tip.z) * 0.68) < 0.95;
}
export function createRace(ctx: GameContext) {
  const cruise = ctx.tuning.num('speedAtFtp', 24, 12, 35, 1);
  const pace = [
    ctx.tuning.num('breezeFtp', 0.55, 0.3, 1.3, 0.05),
    ctx.tuning.num('tradeWindFtp', 0.78, 0.3, 1.3, 0.05),
    ctx.tuning.num('galeFtp', 1.02, 0.3, 1.5, 0.05),
  ];
  const grade = ctx.tuning.num('overloadGrade', 2.5, 0, 5, 0.25);
  const purge = ctx.tuning.num('purgeFtp', 1.1, 0.9, 1.4, 0.05);
  const purgeSeconds = ctx.tuning.num('purgeSeconds', 2, 1, 4, 0.25);
  const rivals: Rival[] = [-0.55, 0.72, 0.05].map((x, i) => ({
    ...chassis(),
    at: [1.6, 4, 9][i],
    x,
    lean: 0,
    stun: 0,
    windup: 0,
    strike: 0,
    side: 1,
    cooldown: 3 + i * 1.4,
    finish: null,
  }));
  const s = {
    ...chassis(),
    menu: true,
    tier: 1,
    at: 0,
    x: 0,
    lateralSpeed: 0,
    speed: 0,
    lean: 0,
    cameraX: 0,
    time: 0,
    boost: 0,
    slow: 0,
    place: 4,
    lap: 1,
    boosts: 0,
    hits: 0,
    strikes: 0,
    counters: 0,
    ringOuts: 0,
    tow: 0,
    shield: 0,
    crates: 0,
    nextCrate: 0,
    swings: 0,
    draft: 0,
    swing: 0,
    side: 1,
    reload: 0,
    contact: false,
    impact: 0,
    impactX: 0,
    purge: 0,
    message: '',
    notice: 0,
    next: 0,
    rivals,
  };
  let paddleReady = true;
  // After a hit the attacker takes point along the contested line. The
  // victim can follow that bike out of overload before the crew comes back.
  let regroupUntil = 0,
    pointRider = 0,
    exitLine = 0;
  function say(message: string) {
    s.message = message;
    s.notice = 1.35;
  }
  function damage(side: number, attacker: number) {
    if (s.shield > 0) {
      s.shield = 0;
      s.grace = 1;
      say('Armour held');
      return;
    }
    s.shove = side * 3.6;
    s.slow = 7;
    s.purge = 0;
    pointRider = attacker;
    exitLine = clamp(s.x, -0.75, 0.75);
    regroupUntil = s.time + s.slow + [20, 16, 13][s.tier];
    for (const rival of rivals) {
      rival.windup = 0;
      rival.strike = 0;
    }
    s.hits++;
    s.speed *= 0.84;
    s.impact = 0.33;
    s.impactX = 0;
    ctx.resistance.set({ id: 'overload', mode: 'sim', gradePct: grade(), ttl: s.slow });
    say('JET OVERLOAD');
  }
  function update(dt: number) {
    if (s.at >= FINISH) return;
    const input = ctx.input(),
      pd = Math.abs(input.paddleR) - Math.abs(input.paddleL);
    const edge = Number(input.pressed.has('right')) - Number(input.pressed.has('left'));
    if (s.menu) {
      let delta = edge;
      if (Math.abs(pd) < 0.18) paddleReady = true;
      else if (paddleReady && Math.abs(pd) > 0.45) {
        delta = Math.sign(pd);
        paddleReady = false;
      }
      s.tier = clamp(s.tier + delta, 0, 2);
      if (input.pressed.has('a')) s.menu = false;
      return;
    }
    s.time += dt;
    s.notice -= dt;
    s.impact = Math.max(0, s.impact - dt);
    s.reload = Math.max(0, s.reload - dt);
    const rescuing = recover(s, dt);
    const previousJumps = s.jumps;
    s.shield = Math.max(0, s.shield - dt);
    s.tow = Math.max(0, s.tow - dt);
    const attack = Number(input.pressed.has('b')) - Number(input.pressed.has('a'));
    if (attack && !s.reload && !rescuing && !s.flight) {
      s.side = attack;
      s.swing = SWING;
      s.reload = 0.96;
      s.contact = false;
      s.swings++;
    }
    s.swing = Math.max(0, s.swing - dt);
    const turn = track(s.at).turn;
    const keys = Number(input.held.has('right')) - Number(input.held.has('left'));
    const steer = keys || edge || (Math.abs(pd) > 0.18 ? Math.sign(pd) : 0);
    const effort = clamp(ctx.bike().ftpFraction, 0, 2);
    const drift = -turn * 0.58 * Math.pow(s.speed / cruise(), 2);
    s.lateralSpeed += (steer * 1.95 + drift - s.lateralSpeed) * (1 - Math.exp(-dt * (steer ? 5 : 9)));
    if (!rescuing) {
      s.x += (s.lateralSpeed * (s.flight ? 0.32 : 1) + s.shove) * dt;
      s.shove *= Math.exp(-dt * 4);
    } else {
      s.lateralSpeed = 0;
      s.speed = 0;
    }
    s.lean += (clamp(-steer * 0.38 - turn * 0.3, -0.64, 0.64) - s.lean) * (1 - Math.exp(-dt * 6));
    s.cameraX += (s.x * 0.76 - s.cameraX) * (1 - Math.exp(-dt * 3.7));
    const inWake = rivals.some(
      (r) =>
        r.finish === null &&
        !r.fall &&
        !r.flight &&
        !r.stun &&
        r.at - s.at > 2.8 &&
        r.at - s.at < 18 &&
        Math.abs(r.x - s.x) < 0.25,
    );
    s.draft = clamp(s.draft + dt * (inWake ? 1.3 : -2.4), 0, 1);
    const target =
      cruise() *
      Math.sqrt(effort) *
      (1 + s.draft * 0.16) *
      (s.boost > 0 ? 1.36 : 1) *
      (s.tow > 0 ? 1.23 : 1) *
      (s.slow > 0 ? 0.72 : 1) *
      (Math.abs(s.x) > Math.max(Math.abs(deck(s.at, s.x > 0).lo), Math.abs(deck(s.at, s.x > 0).hi)) - 0.13
        ? 0.86
        : 1);
    s.speed += (target - s.speed) * (1 - Math.exp(-dt * (target > s.speed ? 1.25 : 0.75)));
    if (rescuing) s.speed = 0;
    else if (s.flight) s.speed = s.launchSpeed;
    const last = s.at;
    s.at = Math.min(FINISH, s.at + s.speed * dt);
    if (!rescuing) crossDeck(s, last, s.speed, dt);
    if (s.fall && !rescuing) {
      if (s.at === FINISH) s.at = last;
      s.boost = 0;
      s.draft = 0;
      s.swing = 0;
      s.speed = 0;
      s.slow = 0;
      s.purge = 0;
      ctx.resistance.clear('overload');
      say('Recovery magnet');
    }
    if (s.jumps > previousJumps) {
      s.boost = 2.8;
      say('Gap cleared · landing boost');
    }
    const finishTime = s.time - dt + (FINISH - last) / Math.max(0.001, s.speed);
    s.lap = Math.min(3, 1 + Math.floor(s.at / LAP));
    s.boost = Math.max(0, s.boost - dt);
    if (s.slow) {
      s.purge = effort >= purge() ? s.purge + dt / purgeSeconds() : 0;
      s.slow = s.purge >= 1 ? 0 : Math.max(0, s.slow - dt);
      if (!s.slow) {
        s.purge = 0;
        ctx.resistance.clear('overload');
        say('Jets clear');
      }
    }
    const pad = pads[s.next % pads.length],
      marker = pad.at + Math.floor(s.next / pads.length) * LAP;
    if (last < marker && s.at >= marker) {
      s.next++;
      if (!s.fall && Math.abs(s.x - pad.x) < 0.31) {
        s.boost = 2.8;
        s.boosts++;
        say('Afterburner');
      }
    }
    const crate = salvage[s.nextCrate % salvage.length],
      crateAt = crate.at + Math.floor(s.nextCrate / salvage.length) * LAP;
    if (last < crateAt && s.at >= crateAt) {
      s.nextCrate++;
      if (!s.fall && Math.abs(s.x - crate.x) < 0.35) {
        const reward = prize(Math.max(...rivals.map((r) => r.at)) - s.at, ctx.rng());
        s.crates++;
        if (reward === 'tow') {
          s.tow = 6;
          say('Tow cell · pedal for boost');
        } else if (reward === 'shield') {
          s.shield = 15;
          say('Scrap armour · one hit');
        } else {
          s.boost = 3;
          say('Overdrive cell');
        }
      }
    }
    const regrouping = s.time < regroupUntil;
    const lead = regrouping ? pointRider : Math.floor(s.time / 12) % 3;
    rivals.forEach((r, i) => {
      if (r.finish !== null || recover(r, dt)) return;
      const oldAt = r.at,
        oldJumps = r.jumps;
      const gap = r.at - s.at,
        flank = i !== lead,
        flankSide = (i + 3 - lead) % 3 === 1 ? -1 : 1;
      const paceSpeed =
        cruise() * Math.sqrt(pace[s.tier]()) * (0.97 + 0.025 * i + 0.045 * Math.sin(s.time / 5 + i));
      // The point rider contests the wake. Wing riders try to draw level, within
      // a bounded pace envelope: actual rider effort can break the formation.
      const nearby = Math.abs(gap) < 32;
      let wantedX = nearby
        ? flank
          ? s.x + flankSide * 0.5
          : s.x + 0.24 * Math.sin(s.time * 0.65)
        : Math.sin(s.time * 0.27 + i * 2) * 0.88;
      if (regrouping && nearby) wantedX = exitLine + (flank ? flankSide * 0.58 : 0);
      const ahead = r.at + 14,
        fork = Math.max(forkWidth(ahead), forkWidth(r.at));
      if (fork > 0) {
        const takeRamp = i === 2 && paceSpeed >= LAUNCH_SPEED * 1.02;
        const line = takeRamp ? rampLine(ahead) : safeLine(ahead);
        wantedX = wantedX * (1 - fork) + line * fork;
      } else if (narrowWidth(ahead) > 0 || narrowWidth(r.at) > 0) wantedX = clamp(wantedX, -0.38, 0.38);
      const vx = r.stun || r.windup ? 0 : clamp((clamp(wantedX, -1.65, 1.3) - r.x) * 1.7, -0.85, 0.85);
      r.x += (vx + r.shove) * dt;
      r.shove *= Math.exp(-dt * 4);
      r.lean += (clamp(-vx * 0.36 - turn * 0.2, -0.6, 0.6) - r.lean) * dt * 5;
      const wantedGap = regrouping && flank ? 16 + flankSide * 3 : flank ? 1.5 : 9;
      const tactical = nearby
        ? clamp(s.speed + (wantedGap - gap) * 0.85, paceSpeed * 0.8, paceSpeed * 1.13)
        : paceSpeed;
      const speed = r.flight
        ? r.launchSpeed
        : tactical * packPace(gap) * (r.stun ? 0.54 : 1) * Math.min(1, s.time * 1.35);

      r.at = Math.min(FINISH, r.at + speed * dt);
      crossDeck(r, oldAt, speed, dt);
      if (r.fall) {
        if (r.at === FINISH) r.at = oldAt;
        if (r.stun > 0) {
          s.ringOuts++;
          say(pilots[i] + ' went over!');
        }
        r.windup = 0;
        r.strike = 0;
        r.stun = 0;
        return;
      }
      if (r.at === FINISH) r.finish = s.time - dt + (FINISH - oldAt) / Math.max(0.001, speed);
      if (r.jumps > oldJumps) r.cooldown = 1;
      r.strike = Math.max(0, r.strike - dt);
      r.stun = Math.max(0, r.stun - dt);
      r.cooldown = Math.max(0, r.cooldown - dt);
      const dx = r.x - s.x,
        dz = r.at - s.at;
      if (
        !s.fall &&
        !s.flight &&
        !r.flight &&
        !r.grace &&
        s.swing > 0.035 &&
        s.swing < 0.42 &&
        !s.contact &&
        swingConnects(dz, dx, s.side, 1 - s.swing / SWING)
      ) {
        s.contact = true;
        s.strikes++;
        if (r.windup > 0) s.counters++;
        say(r.windup ? 'Counter!' : pilots[i] + ' staggered');
        r.windup = 0;
        r.cooldown = 4;
        r.stun = 2.4;
        r.shove = s.side * 3.6;
        r.strike = 0;
        s.impact = 0.26;
        s.impactX = dx;
      }
      if (
        r.strike > 0 &&
        !s.fall &&
        !s.flight &&
        !s.grace &&
        !r.flight &&
        !s.slow &&
        swingConnects(-dz, -dx, r.side, 1 - r.strike / 0.34)
      )
        damage(r.side, i);
      if (r.windup) {
        r.windup = Math.max(0, r.windup - dt);
        if (!r.windup) {
          r.strike = 0.34;
          r.cooldown = 6;
        }
      } else if (
        !s.fall &&
        !s.flight &&
        !s.grace &&
        !r.flight &&
        flank &&
        s.time >= regroupUntil &&
        !s.slow &&
        !r.stun &&
        !r.cooldown &&
        Math.abs(dz) < 3.1 &&
        Math.abs(dx) < 0.8 &&
        !rivals.some((other) => other.windup > 0)
      ) {
        r.side = Math.sign(-dx) || 1;
        r.windup = 1.15;
      }
    });
    for (let i = 0; i < rivals.length; i++) {
      const a = rivals[i];
      if (a.finish !== null || a.fall || a.flight) continue;
      for (const b of [s, ...rivals.slice(i + 1)]) {
        if (b.fall || b.flight || ('finish' in b && b.finish !== null)) continue;
        const dx = a.x - b.x;
        if (Math.abs(a.at - b.at) > 2.25 || Math.abs(dx) > 0.27) continue;
        const shove = (Math.sign(dx) || 1) * (0.27 - Math.abs(dx)) * 0.6;
        a.x += shove;
        b.x -= shove;
      }
    }
    s.place =
      1 +
      rivals.filter((r) => (s.at === FINISH ? r.finish !== null && r.finish < finishTime : r.at > s.at))
        .length;
    if (s.at === FINISH) {
      ctx.resistance.clear('overload');
      ctx.save({ bestPlace: Math.min(s.place, ctx.load<{ bestPlace: number }>()?.bestPlace ?? 4) });
      ctx.emit({ type: 'cloudcup.finish', data: { place: s.place, class: classes[s.tier] } });
    }
  }
  return {
    update,
    inMenu: () => s.menu,
    isOver: () => s.at >= FINISH,
    hud: () => ({
      controls: [
        { button: 'paddles', label: s.menu ? 'Choose class' : 'Lean' },
        { button: 'left', label: 'Left' },
        { button: 'right', label: 'Right' },
        { button: 'a', label: s.menu ? 'Race' : 'Sweep left' },
        { button: 'b', label: 'Sweep right' },
      ],
      touchControls: s.menu ? ['left', 'right', 'a'] : ['left', 'right', 'a', 'b'],
    }),
    snapshot: () => ({ ...s, purgeFtp: purge() }),
    summary: () => ({
      Place: s.place,
      Class: classes[s.tier],
      Laps: Math.floor(s.at / LAP),
      Boosts: s.boosts,
      Strikes: s.strikes,
      Counters: s.counters,
      Falls: s.falls,
      Jumps: s.jumps,
      RingOuts: s.ringOuts,
      Salvage: s.crates,
      Hits: s.hits,
    }),
    dispose: () => ctx.resistance.clear('overload'),
  } satisfies GameSim;
}
export type RaceView = ReturnType<ReturnType<typeof createRace>['snapshot']>;
