import type { GameContext, GameSim } from '../../../contracts';

export const LAP = 1080;
export const FINISH = LAP * 3;
export const classes = ['Rookie', 'Hotshot', 'Outlaw'] as const;
export const pilots = ['Pip', 'Clover', 'Ember'];
export const halfWidth = { boost: 0.34, goo: 0.3, slick: 0.42 };
export type Marker = { at: number; x: number; kind: 'boost' | 'goo' | 'slick' };
export type Rival = { at: number; x: number; slow: number; finish: number | null };
const course: Marker[] = Array.from({ length: 24 }, (_, i) => ({
  at: Math.floor(i / 8) * LAP + ((i % 8) + 0.6) * 130,
  x: [-0.84, 0.85, 0.16, -0.65, 0.73, -0.18, 0.95, -0.92][i % 8],
  kind: i % 2 ? 'goo' : 'boost',
}));

export function createRace(ctx: GameContext) {
  const cruise = ctx.tuning.num('speedAtFtp', 19, 10, 30, 1);
  const pace = [
    ctx.tuning.num('breezeFtp', 0.55, 0.3, 1.3, 0.05),
    ctx.tuning.num('tradeWindFtp', 0.78, 0.3, 1.3, 0.05),
    ctx.tuning.num('galeFtp', 1.02, 0.3, 1.5, 0.05),
  ];
  const grade = ctx.tuning.num('slickGrade', 2.5, 0, 5, 0.25);
  const duration = ctx.tuning.num('slickSeconds', 8, 4, 12, 1);
  const sprintFtp = ctx.tuning.num('purgeFtp', 1.1, 0.9, 1.4, 0.05);
  const sprintSeconds = ctx.tuning.num('purgeSeconds', 2, 1, 4, 0.25);
  const rivals: Rival[] = [-1, 0, 1].map((x, i) => ({ at: 5 + 4 * i, x, slow: 0, finish: null }));
  const s = {
    menu: true,
    tier: 1,
    at: 0,
    x: 0,
    lateralSpeed: 0,
    time: 0,
    boost: 0,
    slow: 0,
    place: 4,
    lap: 1,
    boosts: 0,
    hits: 0,
    lobs: 0,
    item: false,
    message: '',
    notice: 0,
    next: 0,
    purge: 0,
    shot: null as { fromX: number; fromAt: number; target: number; progress: number } | null,
    slick: null as Marker | null,
    rivals,
  };
  let paddleReady = true,
    nextAttack = 10;
  function say(message: string) {
    s.message = message;
    s.notice = 2;
  }
  function action() {
    if (s.menu) {
      s.menu = false;
      return;
    }
    if (!s.item || s.shot) return;
    const target = rivals.filter((r) => r.at > s.at && r.finish === null).sort((a, b) => a.at - b.at)[0];
    if (!target) {
      say('Hold goo for an overtake');
      return;
    }
    s.item = false;
    s.lobs++;
    s.shot = { fromX: s.x, fromAt: s.at, target: rivals.indexOf(target), progress: 0 };
    say('Goo away!');
  }
  return {
    inMenu: () => s.menu,
    isOver: () => s.at >= FINISH,
    update(dt: number) {
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
        s.tier = Math.max(0, Math.min(2, s.tier + delta));
        if (input.pressed.has('a')) action();
        return;
      }
      if (input.pressed.has('a')) action();
      s.time += dt;
      s.notice -= dt;
      const keys = Number(input.held.has('right')) - Number(input.held.has('left'));
      const direction = keys || edge || (Math.abs(pd) > 0.18 ? Math.sign(pd) : 0);
      // Duration controls travel. Even a binary paddle can feather a correction.
      if (!direction) s.lateralSpeed = 0;
      else {
        const previous = Math.sign(s.lateralSpeed) === direction ? Math.abs(s.lateralSpeed) : 0;
        s.lateralSpeed = direction * Math.min(1.65, previous + 4.8 * dt);
      }
      s.x = Math.max(-1.18, Math.min(1.18, s.x + s.lateralSpeed * dt));
      const speed = cruise() * Math.sqrt(Math.max(0, Math.min(2, ctx.bike().ftpFraction)));
      const step = dt * speed * (s.slow > 0 ? 0.65 : s.boost > 0 ? 1.45 : 1);
      const playerFinish = step > 0 ? s.time - dt + (FINISH - s.at) / (step / dt) : Infinity;
      s.at = Math.min(FINISH, s.at + step);
      s.lap = Math.min(3, 1 + Math.floor(s.at / LAP));
      s.boost = Math.max(0, s.boost - dt);
      if (s.slow > 0) {
        s.slow = Math.max(0, s.slow - dt);
        s.purge = ctx.bike().ftpFraction >= sprintFtp() ? s.purge + dt / sprintSeconds() : 0;
        if (s.slow === 0 || s.purge >= 1) {
          s.slow = 0;
          s.purge = 0;
          ctx.resistance.clear('slick');
          say('Jets clear!');
        }
      }
      if (s.shot) {
        s.shot.progress += dt / 0.8;
        if (s.shot.progress >= 1) {
          const rival = rivals[s.shot.target];
          if (rival.finish === null) {
            rival.slow = 4;
            say(pilots[s.shot.target] + ' got slimed!');
          }
          s.shot = null;
        }
      }
      rivals.forEach((r, i) => {
        if (r.finish !== null) return;
        const v =
          cruise() *
          Math.sqrt(pace[s.tier]()) *
          (0.96 + 0.02 * i + 0.06 * Math.sin(s.time / 8 + i * 2)) *
          (r.slow > 0 ? 0.5 : 1);
        r.x = (i - 1) * 0.76 + 0.31 * Math.sin(r.at / 89 + i);
        r.slow = Math.max(0, r.slow - dt);
        if (r.at + v * dt >= FINISH) r.finish = s.time - dt + (FINISH - r.at) / v;
        r.at = Math.min(FINISH, r.at + v * dt);
      });
      s.place =
        1 +
        rivals.filter((r) => (s.at === FINISH ? r.finish !== null && r.finish < playerFinish : r.at > s.at))
          .length;
      const marker = course[s.next];
      if (marker && s.at >= marker.at) {
        s.next++;
        if (Math.abs(marker.x - s.x) <= halfWidth[marker.kind]) {
          if (marker.kind === 'boost') {
            s.boost = 3;
            s.boosts++;
            say('Afterburner!');
          } else {
            s.item = true;
            say('Goo ready · press A');
          }
        }
      }
      if (s.slick && s.at >= s.slick.at) {
        if (Math.abs(s.slick.x - s.x) <= halfWidth.slick) {
          s.slow = duration();
          s.purge = 0;
          s.hits++;
          say('Jets gummed up!');
          ctx.resistance.set({ id: 'slick', mode: 'sim', gradePct: grade(), ttl: s.slow });
        } else say('Clean dodge!');
        s.slick = null;
      }
      if (s.time >= nextAttack && !s.slick && s.at + 65 < FINISH) {
        nextAttack = s.time + 14;
        const attacker = rivals.find((r) => Math.abs(r.at - s.at) < 130 && r.finish === null && !r.slow);
        if (attacker) {
          s.slick = { at: s.at + 65, x: s.x, kind: 'slick' };
          say(pilots[rivals.indexOf(attacker)] + ' spilled goo!');
        }
      }
      if (s.at === FINISH) {
        ctx.resistance.clear('slick');
        ctx.save({ bestPlace: Math.min(s.place, ctx.load<{ bestPlace: number }>()?.bestPlace ?? 4) });
        ctx.emit({ type: 'cloudcup.finish', data: { place: s.place, class: classes[s.tier] } });
      }
    },
    hud: () => ({
      controls: [
        { button: 'paddles', label: s.menu ? 'Choose class' : 'Hold to steer' },
        { button: 'left', label: 'Left' },
        { button: 'right', label: 'Right' },
        { button: 'a', label: s.menu ? 'Race' : 'Lob goo', active: s.menu || s.item },
      ],
      touchControls: ['left', 'right', 'a'],
    }),
    snapshot: () => ({ ...s, purgeFtp: sprintFtp(), markers: course.slice(s.next, s.next + 3) }),
    summary: () => ({
      Place: s.place,
      Class: classes[s.tier],
      Laps: Math.floor(s.at / LAP),
      Boosts: s.boosts,
      Lobs: s.lobs,
      Hits: s.hits,
    }),
    dispose: () => ctx.resistance.clear('slick'),
  } satisfies GameSim;
}
export type RaceView = ReturnType<ReturnType<typeof createRace>['snapshot']>;
