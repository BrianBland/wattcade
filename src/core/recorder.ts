import type { BikeState, GameEvent, SessionRecord, SessionSample, TrainerCommand } from '../contracts';

export class SessionRecorder {
  samples: SessionSample[] = [];
  events: Array<{ t: number } & GameEvent> = [];
  private t = 0; private nextSample = 0;
  private sumP = 0; private n = 0; private maxP = 0; private sumHr = 0; private nHr = 0;
  private zoneS = [0, 0, 0, 0, 0];
  private kj = 0; private sprints = 0;

  event(t: number, e: GameEvent): void { this.events.push({ t, ...e }); }

  /** Record this tick's work only; the bike's cumulative totals span games and idle time. */
  tick(dt: number, bike: Readonly<BikeState>, cmd: TrainerCommand | null, newSprints: number): void {
    this.t += dt;
    const p = bike.raw.power;
    this.sumP += p; this.n++; this.maxP = Math.max(this.maxP, p);
    if (bike.raw.hr !== null) { this.sumHr += bike.raw.hr; this.nHr++; }
    this.zoneS[bike.effortZone - 1] += dt;
    this.kj += (p * dt) / 1000;
    this.sprints += newSprints;
    if (this.t >= this.nextSample) {
      this.nextSample += 1;
      this.samples.push({ t: this.t, power: p, cadence: bike.raw.cadence, hr: bike.raw.hr,
        grade: cmd?.mode === 'sim' ? cmd.gradePct : null, mode: bike.trainerMode });
    }
  }

  finish(meta: { profileId: string; gameId: string; startedAt: number; gameSummary: Record<string, number | string> }): SessionRecord {
    return {
      id: `${meta.gameId}-${meta.startedAt}`, profileId: meta.profileId, gameId: meta.gameId, startedAt: meta.startedAt,
      durationS: this.t, samples: this.samples, events: this.events,
      stats: {
        avgPower: this.n ? this.sumP / this.n : 0, maxPower: this.maxP, kj: this.kj,
        avgHr: this.nHr ? this.sumHr / this.nHr : null, zoneSeconds: this.zoneS.slice(), sprints: this.sprints,
      },
      gameSummary: meta.gameSummary,
    };
  }
}
