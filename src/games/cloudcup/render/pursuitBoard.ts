import { kickSeconds, pursuitPhases, requiredSeconds, targetBand, workBand } from '../sim/pursuit';
import { pilots, type RaceView } from '../sim/race';

export function clockText(seconds: number) {
  const whole = Math.max(0, Math.ceil(seconds - 1e-6));
  return Math.floor(whole / 60) + ':' + String(whole % 60).padStart(2, '0');
}

// Timing board keeps the watt prescription up in the same corner throughout
// the ride. Road warnings and incoming attacks retain the centre of the screen.
export class PursuitBoard {
  readonly el = document.createElement('div');
  private last = '';
  constructor() {
    this.el.className = 'sj-pursuit';
    this.el.hidden = true;
    this.el.innerHTML =
      '<header><b></b><time></time></header><div class="sj-power"><strong></strong><span></span></div><div class="sj-range"><i></i></div><footer></footer>';
  }
  update(s: RaceView) {
    const p = s.pursuit;
    this.el.hidden = !p || s.menu;
    if (!p || s.menu) return;
    const phase = pursuitPhases[p.phase],
      duel = phase.rival >= 0;
    const [low, high] = targetBand(p.phase, p.elapsed, s.tier).map((n) => Math.round(s.ftp * n));
    const direction = s.watts < low ? 'Build' : s.watts > high ? 'Ease' : 'Hold';
    const title = p.complete
      ? 'Pursuit complete'
      : duel
        ? pilots[phase.rival] + ' · ' + (phase.seconds - p.elapsed <= kickSeconds ? 'Kicking' : phase.name)
        : phase.name;
    const time = clockText(phase.seconds - p.elapsed);
    const gain = Math.round(p.split);
    let status = '';
    if (p.complete) status = 'Work in range · ' + clockText(Math.round(p.workSeconds)) + ' / 6:00';
    else if (duel)
      status =
        (gain > 0 ? '+' : '') +
        gain +
        ' m split  ·  ' +
        Math.min(requiredSeconds, Math.floor(p.duelSeconds + 1e-6)) +
        '/' +
        requiredSeconds +
        's in range';
    else if (p.phase && p.elapsed < 9)
      status =
        (p.lastWon ? 'Flag won' : 'Flag missed') +
        ' · ' +
        Math.round(p.lastSeconds) +
        's in range · ' +
        (Math.round(p.lastSplit) > 0 ? '+' : '') +
        Math.round(p.lastSplit) +
        ' m';
    else if (p.phase < 6) {
      const next = pilots[pursuitPhases[p.phase + 1].rival];
      status =
        phase.seconds - p.elapsed <= 15
          ? next +
            ' next · ' +
            workBand(s.tier)
              .map((n) => Math.round(s.ftp * n))
              .join('–') +
            ' W'
          : 'Next · ' + next + '  /  ' + p.flags + '/3 flags';
    } else status = p.flags + '/3 flags · spin easy';
    const key = [title, time, s.watts, low, high, status].join('|');
    if (key === this.last) return;
    this.last = key;
    this.el.querySelector('b')!.textContent = title;
    this.el.querySelector('time')!.textContent = p.complete ? '18:00' : time;
    this.el.querySelector('strong')!.textContent = p.complete ? p.flags + '/3 flags' : s.watts + ' W';
    this.el.querySelector('span')!.textContent = p.complete
      ? 'Finished'
      : direction + ' · ' + low + '–' + high + ' W';
    this.el.querySelector('footer')!.textContent = status;
    this.el.dataset.zone = direction;
    this.el.classList.toggle('complete', p.complete);
    this.el.style.setProperty(
      '--needle',
      Math.max(1, Math.min(99, 30 + (40 * (s.watts - low)) / Math.max(1, high - low))) + '%',
    );
  }
}
