import { play, sfxGraph } from '../../../audio/sfx';
import { setVoice, stopVoices } from '../../../audio/voices';
import { FINISH, type RaceView } from '../sim/race';

export class RallySound {
  private previous?: RaceView;
  private sleep?: ReturnType<typeof setTimeout>;
  update(s: RaceView) {
    const prev = this.previous;
    this.previous = s;
    if (!sfxGraph() || s.menu || s.at >= FINISH) {
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
      gain: 0.026 + load * 0.018,
      filter: { type: 'lowpass', freq: 145 + load * 560, q: 1.2 },
      glide: 0.14,
    });
    setVoice('scrapjet.air', {
      wave: 'noise',
      freq: 0,
      gain: load * (s.draft > 0.65 ? 0.015 : 0.038),
      filter: { type: 'bandpass', freq: 450 + load * 1230, q: 0.75 },
      glide: 0.22,
    });
    if (!prev) return;
    if (s.swings > prev.swings) play('whoosh', { pitch: 1.45, vol: 0.46 });
    if (s.strikes > prev.strikes) play('clank', { pitch: 0.73, vol: 0.9 });
    if (s.hits > prev.hits) play('wreck', { pitch: 0.83, vol: 0.65 });
    if (s.boosts > prev.boosts) play('ignite', { vol: 0.56 });
    if (s.message === 'Jets clear' && prev.message !== s.message) play('chime', { vol: 0.4 });
  }
  stop() {
    clearTimeout(this.sleep);
    stopVoices('scrapjet.');
  }
}
