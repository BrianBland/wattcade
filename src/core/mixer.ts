import type { InputState, Profile, ResistanceController, ResistanceEffect, Seconds, TrainerCommand, Tuning } from '../contracts';

export type SendResult = { ok: boolean; result?: number; detail?: string };
export interface MixerOpts {
  profile: () => Readonly<Profile>;
  tuning: Tuning;
  send: (cmd: TrainerCommand) => Promise<SendResult>;
}

const MIN_INTERVAL_S = 0.75;

/** Combines ResistanceEffects into a rate-limited TrainerCommand. Time is sim time (== real time at 1x). */
export class ResistanceMixer implements ResistanceController {
  private effects = new Map<string, ResistanceEffect & { expiresAt: number }>();
  private now = 0;
  private difficulty: number;
  private panicOn = false;
  private gears = false;
  gear = 6;
  private lastCommand: TrainerCommand | null = null;
  private lastSentAt = -Infinity;
  private lastResult: SendResult | null = null;
  private chosenMode: TrainerCommand['mode'] = 'none';
  private gearStep: () => number;

  constructor(private o: MixerOpts) {
    this.difficulty = o.profile().settings.difficulty ?? 1;
    this.gearStep = o.tuning.num('gearStepPct', 0.8, 0, 3, 0.05, 'Grade added per virtual gear step from neutral');
  }

  set(e: ResistanceEffect): void {
    this.effects.set(e.id, { ...e, expiresAt: e.ttl !== undefined ? this.now + e.ttl : Infinity });
  }
  clear(id: string): void { this.effects.delete(id); }
  clearAll(): void { this.effects.clear(); }
  useVirtualGears(enabled: boolean): void { if (enabled && !this.gears) this.gear = 6; this.gears = enabled; }
  setDifficulty(d: number): void { this.difficulty = Math.min(1.5, Math.max(0.5, d)); }
  getDifficulty(): number { return this.difficulty; }
  panic(on: boolean): void {
    this.panicOn = on;
    if (on) this.send({ mode: 'sim', gradePct: 0 });
  }
  isPanic(): boolean { return this.panicOn; }

  tick(dt: Seconds, input: Readonly<InputState>): void {
    this.now += dt;
    for (const [id, e] of this.effects) if (this.now >= e.expiresAt) this.effects.delete(id);
    if (this.gears) {
      for (const b of input.pressed) {
        if (b === 'shiftUpL' || b === 'shiftUpR') this.gear = Math.min(11, this.gear + 1);
        else if (b === 'shiftDnL' || b === 'shiftDnR') this.gear = Math.max(1, this.gear - 1);
      }
    }
    if (this.panicOn) { this.chosenMode = 'sim'; return; }
    const want = this.compute();
    if (this.shouldSend(want)) this.send(want);
  }

  /** The unthrottled command for the current effects. */
  compute(): TrainerCommand {
    const prof = this.o.profile();
    const all = [...this.effects.values()];
    if (!all.length) {
      this.chosenMode = 'sim';
      return { mode: 'sim', gradePct: this.clampGrade(this.gearOffset(), prof) };
    }
    const top = Math.max(...all.map((e) => e.priority ?? 0));
    const mode = all.find((e) => (e.priority ?? 0) === top)!.mode;
    this.chosenMode = mode;
    const same = all.filter((e) => e.mode === mode);
    if (mode === 'sim') {
      let g = same.reduce((a, e) => a + (e.gradePct ?? 0), 0);
      if (g > 0) g *= this.difficulty;
      return { mode: 'sim', gradePct: this.clampGrade(g + this.gearOffset(), prof) };
    }
    if (mode === 'erg') {
      let w = Math.max(0, ...same.map((e) => e.watts ?? (e.ftpFraction !== undefined ? e.ftpFraction * prof.ftp : 0)));
      w *= this.difficulty;
      return { mode: 'erg', watts: Math.min(prof.ftp * prof.settings.ergCapFtpFraction, Math.max(60, w)) };
    }
    const lvl = same.reduce((a, e) => a + (e.levelPct ?? 0), 0) * this.difficulty;
    return { mode: 'resistance', levelPct: Math.min(100, Math.max(0, lvl)) };
  }

  private gearOffset(): number { return this.gears ? (this.gear - 6) * this.gearStep() : 0; }
  private clampGrade(g: number, prof: Readonly<Profile>): number { return Math.min(prof.settings.maxGradePct, Math.max(-5, g)); }

  private shouldSend(c: TrainerCommand): boolean {
    const l = this.lastCommand;
    if (!l) return true;
    if (this.now - this.lastSentAt < MIN_INTERVAL_S - 1e-9) return false;
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
    this.o.send(c).then((r) => { this.lastResult = r; }, (e) => { this.lastResult = { ok: false, detail: String(e) }; });
  }

  debug() {
    return {
      activeEffects: [...this.effects.values()].map(({ expiresAt, ...e }) => e),
      chosenMode: this.chosenMode, lastCommand: this.lastCommand, lastResult: this.lastResult,
      difficulty: this.difficulty, gear: this.gear, gearsEnabled: this.gears, panic: this.panicOn,
    };
  }
  get command(): TrainerCommand | null { return this.lastCommand; }
}
