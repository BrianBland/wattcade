// A fishing stop (#187): pick a spot, cast, wait, strike, pull, haul up, catch card. Pure and deterministic for a
// given rng. The scene's planned sprints (`Scene.pulls`) are its bite slots: the sim says when the next one is due
// (its effort plan reached the slot), and holds the scene through the bite and the fight.
import { pickFish, SPOTS, type FishCatch, type FishingLocation, type Spot } from './catalogue';
import { Pull, pullTarget, type PullTuning } from './pull';
import type { PullPlan } from './types';

export type FishPhase = 'spot' | 'cast' | 'wait' | 'bite' | 'pull' | 'haul' | 'escape' | 'card' | 'done';

export interface FishingTuning {
  /** The rod casts itself after this long at the spot picker (idle or scripted riders). */
  autoCastS: number;
  /** Wind-up + flight (s). */
  castS: number;
  /** Cadence at release → distance 0..1 between these rpm. */
  castRpmLo: number; castRpmHi: number;
  /** Once a slot is due, the bobber plunges after this long (s, random in range). */
  biteMinS: number; biteMaxS: number;
  /** After an escape the next bite (same slot) comes after this long. */
  retryMinS: number; retryMaxS: number;
  /** A bite comes anyway after this long in the water (a slow rider never waits forever). */
  maxWaitS: number;
  /** Strike within this window for full credit; the hook sets itself at `autoSetS` for `lateCredit`. */
  biteWindowS: number; autoSetS: number; lateCredit: number;
  /** A fish gets away after this long with the rider below "pedalling" (`PullTuning.pedalFtp`); pedalling winds it back. */
  slackS: number;
  /** Bites per slot before the stop gives up on it. */
  triesPerFish: number;
  /** Spinning at or above this cadence twitches the lure: the wait for the next bite runs (1 + bonus) × faster. */
  twitchRpm: number; twitchBonus: number;
  haulS: number; escapeS: number; cardS: number;
}

export const FISHING_DEFAULTS: FishingTuning = {
  autoCastS: 10, castS: 2.6, castRpmLo: 50, castRpmHi: 110,
  biteMinS: 2, biteMaxS: 6, retryMinS: 8, retryMaxS: 20, maxWaitS: 150,
  biteWindowS: 2, autoSetS: 3, lateCredit: 0.5, slackS: 30, triesPerFish: 2,
  twitchRpm: 95, twitchBonus: 0.5,
  haulS: 2.5, escapeS: 2.5, cardS: 4,
};

export interface FishingInput {
  /** A pressed this tick (cast, strike, dismiss the card). */
  a: boolean;
  /** Spot picker step (paddles / D-pad left-right): −1, 0, +1. */
  step: number;
  /** A tap on a spot marker (touch): picks it; tapping the picked spot casts. */
  tap?: number;
  /** Power (fraction of FTP) and cadence (rpm). */
  frac: number; rpm: number;
  /** The current slot is due (the scene's effort plan reached it). */
  due: boolean;
  /** The fish is running right now (workout surge): the line loads up. */
  running: boolean;
}

export type FishingEvent =
  | { type: 'cast'; spot: string; cast: number }
  | { type: 'bite'; early: boolean }
  | { type: 'hook'; fish: FishCatch; late: boolean }
  | { type: 'landed'; fish: FishCatch; pull: Pull }
  | { type: 'escaped'; fish: FishCatch; pull: Pull; retry: boolean }
  | { type: 'slot'; slot: number }
  | { type: 'done' };

export interface FishingView {
  location: FishingLocation;
  phase: FishPhase; phaseT: number;
  spot: number; spots: Array<Pick<Spot, 'id' | 'name' | 'x' | 'far'>>;
  /** Cast distance 0..1 (set at release). */
  cast: number;
  /** Line load 0..1 (rod bend) and the fish's stamina 1..0. */
  tension: number; stamina: number;
  /** The lure is twitching (fast spin while waiting); seconds since the last nibble. */
  twitch: boolean; nibbleAge: number;
  /** Hooked, landed or lost (from the strike to the card). */
  fish?: FishCatch;
  /** Fish landed at this stop. */
  caught: FishCatch[];
  slot: number; slots: number; tries: number;
  /** Seconds until the rod casts itself (spot) or the hook sets itself (bite); -1 otherwise. */
  autoIn: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export class FishingStop {
  phase: FishPhase = 'spot';
  phaseT = 0;
  spot = 0;
  cast = 0;
  tension = 0;
  twitch = false;
  nibbleAge = 99;
  fish: FishCatch | undefined;
  pull: Pull | null = null;
  readonly caught: FishCatch[] = [];
  /** Index into `slots` of the bite we're fishing for; tries spent on it. */
  slot: number;
  tries = 0;
  private slack = 0;
  private waitT = 0; private dueT = 0; private biteAt = 0; private nibbleIn = 0; private retry = false;
  readonly spots: Spot[];

  constructor(readonly location: FishingLocation, readonly slots: readonly PullPlan[], private rng: () => number, firstSlot = 0) {
    this.spots = SPOTS[location];
    this.slot = firstSlot;
    if (this.slot >= slots.length) this.phase = 'done';
  }

  /** The scene holds while the bobber is down and the fish fights. */
  holds(): boolean { return this.phase === 'bite' || this.phase === 'pull'; }
  /** Waiting with a twitching lure: the sim speeds the plan up by (1 + twitchBonus). */
  twitching(): boolean { return this.phase === 'wait' && this.twitch; }

  private go(p: FishPhase) { this.phase = p; this.phaseT = 0; }
  private range(a: number, b: number) { return a + (b - a) * this.rng(); }

  tick(dt: number, inp: FishingInput, t: FishingTuning, pt: PullTuning): FishingEvent[] {
    const ev: FishingEvent[] = [];
    this.phaseT += dt; this.nibbleAge += dt;
    switch (this.phase) {
      case 'spot': {
        const n = this.spots.length;
        let moved = false;
        if (inp.step) { this.spot = (this.spot + Math.sign(inp.step) + n) % n; moved = true; }
        let cast = inp.a || this.phaseT >= t.autoCastS;
        if (inp.tap !== undefined && inp.tap >= 0 && inp.tap < n) {
          if (inp.tap === this.spot) cast = true; else { this.spot = inp.tap; moved = true; }
        }
        if (moved && !cast) this.phaseT = 0; // still choosing
        if (cast) {
          this.cast = +clamp01((inp.rpm - t.castRpmLo) / Math.max(1, t.castRpmHi - t.castRpmLo)).toFixed(2);
          this.waitT = 0; this.dueT = 0;
          this.biteAt = this.retry ? this.range(t.retryMinS, t.retryMaxS) : this.range(t.biteMinS, t.biteMaxS);
          this.nibbleIn = this.range(3, 9);
          this.fish = undefined;
          ev.push({ type: 'cast', spot: this.spots[this.spot].id, cast: this.cast });
          this.go('cast');
        }
        this.tension = 0;
        break;
      }
      case 'cast':
        if (this.phaseT >= t.castS) this.go('wait');
        break;
      case 'wait': {
        this.twitch = inp.rpm >= t.twitchRpm;
        const k = this.twitch ? 1 + t.twitchBonus : 1;
        this.waitT += dt;
        if (inp.due) this.dueT += dt * k;
        if ((this.nibbleIn -= dt * k) <= 0) { this.nibbleAge = 0; this.nibbleIn = this.range(3, 9); }
        this.tension = 0.05 + 0.25 * Math.max(0, 1 - this.nibbleAge / 0.4);
        const early = !inp.due && this.waitT >= t.maxWaitS;
        if ((inp.due && this.dueT >= this.biteAt) || early) {
          this.twitch = false;
          ev.push({ type: 'bite', early });
          this.go('bite');
        }
        break;
      }
      case 'bite': {
        this.tension = 0.5;
        const late = this.phaseT > t.biteWindowS;
        if (inp.a || this.phaseT >= t.autoSetS) {
          const pl = this.slots[this.slot];
          const credit = late ? t.lateCredit : 1;
          this.fish = pickFish(this.spots[this.spot], pl.size, this.cast, credit, this.rng);
          const tg = pullTarget(pl.size, pt);
          this.pull = new Pull(pl.size, tg.ftp, tg.s, false);
          this.tries++; this.slack = 0;
          ev.push({ type: 'hook', fish: this.fish, late });
          this.go('pull');
        }
        break;
      }
      case 'pull': {
        const p = this.pull!;
        this.slack = inp.frac < pt.pedalFtp ? this.slack + dt : Math.max(0, this.slack - dt);
        let r = p.tick(dt, inp.frac, pt);
        if (r === 'pulling' && this.slack >= t.slackS) r = 'escaped';
        const k = Math.max(0, inp.frac) / p.ftp;
        this.tension = clamp01((inp.running ? 0.7 : 0.45) + 0.3 * clamp01(1 - k));
        if (r === 'landed') {
          this.caught.push(this.fish!);
          ev.push({ type: 'landed', fish: this.fish!, pull: p });
          this.resolveSlot(ev);
          this.go('haul');
        } else if (r === 'escaped') {
          const retry = this.tries < t.triesPerFish;
          ev.push({ type: 'escaped', fish: this.fish!, pull: p, retry });
          this.retry = retry;
          if (!retry) this.resolveSlot(ev);
          this.go('escape');
        }
        if (r !== 'pulling') this.pull = null;
        break;
      }
      case 'haul':
        this.tension = 0.6 * (1 - this.phaseT / t.haulS);
        if (this.phaseT >= t.haulS) this.go('card');
        break;
      case 'card':
        this.tension = 0;
        if (this.phaseT >= t.cardS || (inp.a && this.phaseT >= 0.8)) this.next(ev);
        break;
      case 'escape':
        this.tension = 0;
        if (this.phaseT >= t.escapeS) this.next(ev);
        break;
      case 'done':
        this.tension = 0;
        break;
    }
    return ev;
  }

  private resolveSlot(ev: FishingEvent[]) {
    ev.push({ type: 'slot', slot: this.slot });
    this.slot++; this.tries = 0; this.retry = false;
  }

  private next(ev: FishingEvent[]) {
    if (this.slot >= this.slots.length) { ev.push({ type: 'done' }); this.go('done'); }
    else this.go('spot');
  }

  view(t: FishingTuning): FishingView {
    const autoIn = this.phase === 'spot' ? Math.max(0, t.autoCastS - this.phaseT) : this.phase === 'bite' ? Math.max(0, t.autoSetS - this.phaseT) : -1;
    return {
      location: this.location, phase: this.phase, phaseT: this.phaseT,
      spot: this.spot, spots: this.spots.map(({ id, name, x, far }) => ({ id, name, x, far })),
      cast: this.cast, tension: +this.tension.toFixed(3), stamina: this.pull ? +this.pull.stamina.toFixed(3) : this.phase === 'haul' || this.phase === 'card' ? 0 : 1,
      twitch: this.twitch, nibbleAge: this.nibbleAge,
      ...(this.fish && { fish: this.fish }),
      caught: this.caught.slice(), slot: this.slot, slots: this.slots.length, tries: this.tries, autoIn,
    };
  }
}
