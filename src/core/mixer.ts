import type { InputState, Profile, ResistanceController, ResistanceEffect, Seconds, TrainerCommand, Tuning } from '../contracts';

export type SendResult = { ok: boolean; result?: number; detail?: string };
export interface MixerOpts {
  profile: () => Readonly<Profile>;
  tuning: Tuning;
  send: (cmd: TrainerCommand) => Promise<SendResult>;
  /** Rider cadence (rpm) for the ERG low-cadence relief; omit to disable it. */
  cadence?: () => number;
  nativeShifting?: () => boolean;
  trainerRevision?: () => number;
}

const MIN_INTERVAL_S = 0.75;

/** Combines ResistanceEffects into a rate-limited TrainerCommand. Time is sim time (== real time at 1x). */
export class ResistanceMixer implements ResistanceController {
  private effects = new Map<string, ResistanceEffect & { expiresAt: number }>();
  private now = 0;
  private difficulty: number;
  private panicOn = false;
  private gears = false;
  private gearSide: 'L' | 'R' | undefined;
  gear = 6;
  private nativeGears = false;
  private trainerRevision: number | undefined;
  private lastCommand: TrainerCommand | null = null;
  private lastSentAt = -Infinity;
  private lastResult: SendResult | null = null;
  private sendSequence = 0;
  private chosenMode: TrainerCommand['mode'] = 'none';
  private gearStep: () => number;
  private rampS: () => number;
  private rampLeft = 0; private rampTotal = 0; private rampSettle = false;
  private ergRelief = 1;
  private reliefRpm: () => number; private reliefFloor: () => number; private reliefRecoverS: () => number;

  constructor(private o: MixerOpts) {
    this.difficulty = o.profile().settings.difficulty ?? 1;
    this.gearStep = o.tuning.num('gearStepPct', 0.8, 0, 3, 0.05, 'Grade added per virtual gear step from neutral');
    this.rampS = o.tuning.num('rampInS', 6, 0, 30, 1, 'Seconds to ease a game\'s resistance in after its countdown');
    this.reliefRpm = o.tuning.num('ergReliefRpm', 55, 0, 90, 1, 'ERG: below this cadence, ease the target off so the rider can spin back up (0 = off)');
    this.reliefFloor = o.tuning.num('ergReliefFloor', 0.6, 0.2, 1, 0.05, 'ERG: lowest fraction of the target while relief is on');
    this.reliefRecoverS = o.tuning.num('ergReliefRecoverS', 8, 1, 30, 1, 'ERG: seconds to ramp back to the full target once cadence recovers');
  }

  set(e: ResistanceEffect): void {
    this.effects.set(e.id, { ...e, expiresAt: e.ttl !== undefined ? this.now + e.ttl : Infinity });
  }
  clear(id: string): void { this.effects.delete(id); }
  clearAll(): void { this.effects.clear(); }
  useVirtualGears(enabled: boolean, side?: 'L' | 'R'): void { this.syncGearing(); if (enabled && !this.gears) this.gear = this.nativeGears ? 12 : 6; this.gears = enabled; this.gearSide = side; }
  private syncGearing(): void {
    const native = this.o.nativeShifting?.() === true;
    if (native === this.nativeGears) return;
    this.nativeGears = native; this.gear = native ? 12 : 6;
    this.lastCommand = null; // resend even when the road gradient is unchanged
  }
  setDifficulty(d: number): void { this.difficulty = Math.min(1.5, Math.max(0.5, d)); }
  getDifficulty(): number { return this.difficulty; }
  panic(on: boolean): void {
    this.panicOn = on;
    if (on) { this.syncGearing(); this.send({ mode: 'sim', gradePct: 0, ...(this.nativeGears ? { virtualGear: 1 } : {}) }); }
  }
  isPanic(): boolean { return this.panicOn; }
  /** Ease the next commands in from neutral over `seconds` (default tuning core.rampInS), e.g. after a game's countdown. */
  rampIn(seconds = this.rampS()): void { this.rampTotal = this.rampLeft = Math.max(0, seconds); }
  /** Scale a command toward neutral while a ramp-in runs (k: 0 = neutral, 1 = full). */
  private ramped(c: TrainerCommand): TrainerCommand {
    if (this.rampLeft <= 0 || this.rampTotal <= 0) return c;
    const k = 1 - this.rampLeft / this.rampTotal;
    if (c.mode === 'sim') return { ...c, gradePct: +(c.gradePct * k).toFixed(2) };
    if (c.mode === 'erg') return { ...c, watts: Math.round(c.watts * (0.5 + 0.5 * k)) };
    if (c.mode === 'resistance') return { ...c, levelPct: c.levelPct * k };
    return c;
  }

  tick(dt: Seconds, input: Readonly<InputState>): void {
    this.now += dt;
    this.syncGearing();
    const revision = this.o.trainerRevision?.();
    if (revision !== this.trainerRevision) { this.trainerRevision = revision; this.lastCommand = null; }
    for (const [id, e] of this.effects) if (this.now >= e.expiresAt) this.effects.delete(id);
    if (this.gears) {
      const sides = this.gearSide ? [this.gearSide] : ['L', 'R'];
      for (const b of input.pressed) {
        if (sides.some((s) => b === `shiftUp${s}`)) this.gear = Math.min(this.nativeGears ? 24 : 11, this.gear + 1);
        else if (sides.some((s) => b === `shiftDn${s}`)) this.gear = Math.max(1, this.gear - 1);
      }
    }
    this.tickErgRelief(dt);
    if (this.panicOn) { this.chosenMode = 'sim'; if (!this.lastCommand) this.panic(true); return; }
    if (this.rampLeft > 0) { this.rampLeft = Math.max(0, this.rampLeft - dt); if (this.rampLeft === 0) this.rampSettle = true; }
    const want = this.ramped(this.compute());
    // when a ramp ends, land exactly on the full command even if the last step is below the send thresholds
    const settle = this.rampSettle && this.now - this.lastSentAt >= MIN_INTERVAL_S - 1e-9;
    if (settle) this.rampSettle = false;
    if (settle ? JSON.stringify(want) !== JSON.stringify(this.lastCommand) : this.shouldSend(want)) this.send(want);
  }

  /**
   * ERG "spiral of death" guard: at a fixed target, slower cranks mean more torque, so a rider who bogs down
   * can get stuck. Below `ergReliefRpm` the target drops quickly toward `ergReliefFloor` × target; once cadence
   * is back above the threshold + 10 rpm it ramps up over `ergReliefRecoverS`.
   */
  private tickErgRelief(dt: Seconds): void {
    const rpm = this.reliefRpm(), floor = this.reliefFloor();
    if (!this.o.cadence || rpm <= 0 || this.chosenMode !== 'erg') { this.ergRelief = 1; return; }
    const c = this.o.cadence();
    if (c < rpm) this.ergRelief = Math.max(floor, this.ergRelief - dt * 0.5);
    else if (c >= rpm + 10) this.ergRelief = Math.min(1, this.ergRelief + (dt * (1 - floor)) / this.reliefRecoverS());
    if (this.ergRelief < floor) this.ergRelief = floor;
  }

  /** The unthrottled command for the current effects. */
  compute(): TrainerCommand {
    this.syncGearing();
    const prof = this.o.profile();
    const all = [...this.effects.values()];
    if (!all.length) {
      this.chosenMode = 'sim';
      return this.simCommand(this.clampGrade(this.gearOffset(), prof));
    }
    const top = Math.max(...all.map((e) => e.priority ?? 0));
    const mode = all.find((e) => (e.priority ?? 0) === top)!.mode;
    this.chosenMode = mode;
    const same = all.filter((e) => e.mode === mode);
    if (mode === 'sim') {
      let g = same.reduce((a, e) => a + (e.gradePct ?? 0), 0);
      if (g > 0) g *= this.difficulty;
      return this.simCommand(this.clampGrade(g + this.gearOffset(), prof));
    }
    if (mode === 'erg') {
      let w = Math.max(0, ...same.map((e) => e.watts ?? (e.ftpFraction !== undefined ? e.ftpFraction * prof.ftp : 0)));
      w *= this.difficulty * this.ergRelief;
      return { mode: 'erg', watts: Math.min(prof.ftp * prof.settings.ergCapFtpFraction, Math.max(60, w)) };
    }
    const lvl = same.reduce((a, e) => a + (e.levelPct ?? 0), 0) * this.difficulty;
    return { mode: 'resistance', levelPct: Math.min(100, Math.max(0, lvl)) };
  }

  private simCommand(gradePct: number): Extract<TrainerCommand, { mode: 'sim' }> {
    return { mode: 'sim', gradePct, ...(this.nativeGears ? { virtualGear: this.gears ? this.gear : 12 } : {}) };
  }
  private gearOffset(): number { return this.gears && !this.nativeGears ? (this.gear - 6) * this.gearStep() : 0; }
  private clampGrade(g: number, prof: Readonly<Profile>): number { return Math.min(prof.settings.maxGradePct, Math.max(-5, g)); }

  private shouldSend(c: TrainerCommand): boolean {
    const l = this.lastCommand;
    if (!l) return true;
    // Ratios use the native channel: shifts should not wait for the road's 750ms rate limit.
    if (c.mode === 'sim' && l.mode === 'sim' && c.virtualGear !== l.virtualGear) return true;
    if (this.now - this.lastSentAt < MIN_INTERVAL_S - 1e-9) return false;
    if (this.lastResult?.ok === false) return true;
    if (l.mode !== c.mode) return true;
    switch (c.mode) {
      case 'sim': return Math.abs(c.gradePct - (l as typeof c).gradePct) >= 0.2;
      case 'erg': return Math.abs(c.watts - (l as typeof c).watts) >= 5;
      case 'resistance': return Math.abs(c.levelPct - (l as typeof c).levelPct) >= 2;
      default: return false;
    }
  }

  private send(c: TrainerCommand): void {
    this.lastCommand = c; this.lastSentAt = this.now;
    this.lastResult = null;
    const sequence = ++this.sendSequence;
    this.o.send(c).then((r) => { if (sequence === this.sendSequence) this.lastResult = r; }, (e) => { if (sequence === this.sendSequence) this.lastResult = { ok: false, detail: String(e) }; });
  }

  debug() {
    return {
      activeEffects: [...this.effects.values()].map(({ expiresAt, ...e }) => e),
      chosenMode: this.chosenMode, lastCommand: this.lastCommand, lastResult: this.lastResult,
      difficulty: this.difficulty, ergRelief: +this.ergRelief.toFixed(2), gear: this.gear, gearsEnabled: this.gears, nativeGears: this.nativeGears, panic: this.panicOn,
    };
  }
  get command(): TrainerCommand | null { return this.lastCommand; }
}
