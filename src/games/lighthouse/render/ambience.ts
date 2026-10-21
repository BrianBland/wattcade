// Coastal soundscape: a low sea bed, individual breakers and weather-driven gusts, with delayed rolling thunder.
// Uses sim time for events, so pauses and sleeping tabs never accumulate a burst of overdue sounds.
import { ambientDucked, setAmbient, soundEnabled, stopAmbient } from '../../../audio/sfx';
import { ISLAND_MIX, playIsland as play } from './audio';

interface CoastState { t: number; chop: number; fog: number; storm: number; windy: number; shower: number }

export class IslandAmbience {
  private lastT = -1; private movedAt = -Infinity;
  private nextWave = 0; private nextGust = 0;
  private thunder?: { at: number; close: boolean; pitch: number };

  constructor(private rng = Math.random) {}

  lightning(t: number, close: boolean) {
    // One pending strike is enough: a new flash should never build an unbounded queue.
    this.thunder = { at: t + (close ? 0.3 : 0.7) + this.rng() * 0.8, close, pitch: 0.8 + this.rng() * 0.35 };
  }

  /** Returns whether village scenery sounds may play, too. Wall time only detects a stopped sim. */
  update(s: CoastState, wallS = performance.now() / 1000): boolean {
    if (s.t > this.lastT && s.t > 0) this.movedAt = wallS;
    this.lastT = s.t;
    const audible = wallS - this.movedAt < 0.6 && soundEnabled() && !ambientDucked();
    // Two overlapping swells avoid a metronomic, single sine-wave wash.
    const surf = 0.5 + 0.3 * Math.sin(s.t * 0.83) + 0.2 * Math.sin(s.t * 0.47 + 1.7);
    setAmbient('sea', audible ? (0.04 + 0.045 * surf + s.chop * 0.07) * ISLAND_MIX.beds.sea : 0, 330 + surf * 300, 0.5);
    setAmbient('wind', audible ? (s.storm * 0.16 + s.fog * 0.02 + s.windy * 0.06) * ISLAND_MIX.beds.wind : 0, 650 + Math.sin(s.t * 0.4) * 200, 1.0);
    setAmbient('rain', audible ? (Math.max(0, s.storm - 0.15) * 0.18 + s.shower * 0.05) * ISLAND_MIX.beds.rain : 0, 2800, 0.3);
    if (!audible) {
      this.thunder = undefined;
      this.nextWave = s.t + 1.5; this.nextGust = s.t + 4;
      return false;
    }
    if (this.thunder && s.t >= this.thunder.at) {
      const th = this.thunder; this.thunder = undefined;
      // Ignore stale strikes after a tab suspension or a jump in the sim clock.
      if (s.t - th.at < 1) {
        if (th.close) play('thunder', { vol: 0.5, pitch: th.pitch, minGapS: 1.5 });
        play('thunderRoll', { vol: th.close ? 0.95 : 0.65, pitch: th.pitch, minGapS: 1.5 });
      }
    }
    if (s.t >= this.nextWave) {
      this.nextWave = s.t + (5 + this.rng() * 4) / (1 + s.chop * 0.35);
      play('shoreBreak', { vol: 0.65 + s.chop * 0.7 + s.storm * 0.25, pitch: 0.85 + this.rng() * 0.3 });
    }
    if (s.t >= this.nextGust) {
      this.nextGust = s.t + 10 + this.rng() * 14;
      const wind = Math.max(s.storm, s.windy);
      if (wind > 0.15) play('windGust', { vol: wind * 1.2, pitch: 0.75 + this.rng() * 0.3 });
    }
    return true;
  }

  dispose() {
    this.thunder = undefined; this.lastT = -1; this.movedAt = -Infinity;
    this.nextWave = 0; this.nextGust = 0;
    stopAmbient();
  }
}
