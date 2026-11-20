import { play, sfxGraph } from '../../../audio/sfx';
import { setVoice, stopVoices } from '../../../audio/voices';
import { rattleChain } from './chainAudio';
import { forkCycle, stations } from '../sim/stormglass';
import { fireboxLight } from '../sim/kiln';
import { CATCH, RESCUE, lapAt } from '../sim/deck';
import { type RaceView } from '../sim/race';

export class RallySound {
  private winding = -1;
  private previous?: RaceView;
  private sleep?: ReturnType<typeof setTimeout>;
  update(s: RaceView) {
    const prev = this.previous;
    this.previous = s;
    if (!sfxGraph() || s.menu || s.at >= s.finishAt) {
      this.stop();
      return;
    }
    if (prev?.time === s.time) return;
    clearTimeout(this.sleep);
    this.sleep = setTimeout(() => this.stop(), 300);
    const load = Math.min(1, s.speed / 32);
    setVoice('scrapjet.turbine', {
      wave: 'sawtooth',
      freq: 44 + load * 74 + (s.boost ? 17 : 0),
      gain: (0.026 + load * 0.018) * (s.flight ? 0.48 : 1),
      filter: { type: 'lowpass', freq: 145 + load * 560, q: 1.2 },
      glide: 0.14,
    });
    setVoice('scrapjet.air', {
      wave: 'noise',
      freq: 0,
      gain: load * (s.flight ? 0.072 : s.draft > 0.65 ? 0.015 : 0.038),
      filter: { type: 'bandpass', freq: 450 + load * 1230, q: 0.75 },
      glide: 0.22,
    });
    if (s.course === 2) {
      const d = lapAt(s.at);
      const station = stations.find((g) => Math.abs(g.at - d) < 65);
      const cycle = station ? forkCycle(station, s.time) : undefined;
      const proximity = station ? 1 - Math.abs(station.at - d) / 65 : 0;
      setVoice('scrapjet.substation', {
        wave: 'triangle',
        freq: 68 + (cycle?.warning ?? 0) * 100,
        gain: proximity * (0.025 + 0.065 * (cycle?.warning ?? 0)),
        filter: { type: 'lowpass', freq: 750, q: 0.7 },
        glide: 0.08,
      });
      if (prev && s.collector.hits > prev.collector.hits) play('clank', { vol: 0.6, pitch: 0.62 });
      if (prev && s.collector.clears > prev.collector.clears) play('chime', { vol: 0.5, pitch: 1.14 });
    }
    if (s.course === 1) {
      const heat = fireboxLight(s.at);
      setVoice('scrapjet.kiln', {
        wave: 'triangle',
        freq: 55 + heat * 11,
        gain: heat * 0.063,
        filter: { type: 'lowpass', freq: 220, q: 0.7 },
        glide: 0.22,
      });
      setVoice('scrapjet.pressure', {
        wave: 'noise',
        freq: 0,
        gain: s.firing.onSeam ? 0.037 : 0,
        filter: { type: 'bandpass', freq: 570 + Math.min(1, s.firing.coverage) * 1100, q: 2.6 },
        glide: 0.13,
      });
      if (prev && s.firing.releases > prev.firing.releases) play('whoosh', { pitch: 0.68, vol: 0.62 });
    }
    const winding = s.rivals.findIndex((r) => r.windup > 0);
    if (winding >= 0 && this.winding !== winding) rattleChain(s.rivals[winding].x < s.x ? -1 : 1);
    this.winding = winding;
    if (!prev) return;
    if (s.flight && !prev.flight) play('whoosh', { pitch: 0.86, vol: 0.35 });
    if (s.jumps > prev.jumps) {
      play('mortarThump', { pitch: 0.82, vol: 0.6 });
      play('ignite', { vol: 0.38 });
    }
    if (s.falls > prev.falls) play('whoosh', { pitch: 0.56, vol: 0.62 });
    if (prev.fall > RESCUE - CATCH && s.fall <= RESCUE - CATCH) play('clank', { pitch: 0.69, vol: 0.42 });
    if (prev.fall && !s.fall) play('ignite', { pitch: 0.82, vol: 0.32 });
    if (s.swings > prev.swings) play('whoosh', { pitch: 1.45, vol: 0.46 });
    if (s.strikes > prev.strikes) play('clank', { pitch: 0.73, vol: 0.9 });
    if (s.hits > prev.hits) play('wreck', { pitch: 0.83, vol: 0.65 });
    if (s.boosts > prev.boosts) play('ignite', { vol: 0.56 });
    if (s.message === 'Jets clear' && prev.message !== s.message) play('chime', { vol: 0.4 });
  }
  stop() {
    clearTimeout(this.sleep);
    this.winding = -1;
    stopVoices('scrapjet.');
  }
}
