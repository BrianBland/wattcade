// Scripted demo of the Dynamo Defense sound engine: drives DynamoSound through a ride-like sweep and fires the new
// one-shots, while drawing the current inputs. window.__start() runs it (30 s); window.__label is the current step.
import { play, setSoundEnabled, unlockAudio } from '../src/audio/sfx';
import { DynamoSound, type DynamoIn } from '../src/games/towerdefense/render/dynamoSound';

const STEPS: Array<{ at: number; label: string; set: (t: number) => Partial<DynamoIn>; shots?: Array<[number, Parameters<typeof play>[0]]> }> = [
  { at: 0, label: 'Gatling · spin up 60 → 110 rpm', set: (u) => ({ weapon: 'gatling', cadence: 60 + 50 * u, ftpFraction: 0.6, gatlingFiring: 3 }) },
  { at: 6, label: 'Gatling · power steps 50% → 130% FTP at 90 rpm', set: (u) => ({ weapon: 'gatling', cadence: 90, ftpFraction: 0.5 + 0.8 * Math.floor(u * 4) / 3, gatlingFiring: 3 }) },
  { at: 12, label: 'Flamer · watts ramp (roar brightens)', set: (u) => ({ weapon: 'flame', cadence: 75, ftpFraction: 0.6 + 0.6 * u, flaming: true, flamePower: 0.3 + 1.1 * u }) },
  { at: 18, label: 'Railgun · capacitor charging at threshold', set: (u) => ({ weapon: 'rail', cadence: 85, ftpFraction: 0.95, railCharging: true, railProgress: (u * 2.5) % 1 }), shots: [[23.5, 'railShot']] },
  { at: 24, label: 'Sprint → Overdrive', set: () => ({ weapon: 'gatling', cadence: 115, ftpFraction: 1.4, overdrive: true, gatlingFiring: 3 }) },
  { at: 27, label: 'One-shots: tesla · mortar · prism · crunch · ignite · build · bolt-on · clank', set: () => ({ weapon: 'gatling', cadence: 80, ftpFraction: 0.6 }),
    shots: [[27, 'teslaCrack'], [27.4, 'mortarThump'], [27.9, 'prismBeam'], [28.4, 'chitinCrunch'], [28.6, 'chitinCrunchBig'], [29.1, 'ignite'], [29.6, 'rivetBuild'], [30.5, 'boltOn'], [31.3, 'clank'], [31.7, 'hiveHorn'], [33.4, 'waveClearTd']] },
];
const END = 35;
const base: DynamoIn = { active: true, cadence: 0, ftpFraction: 0, crankRevs: 0, overdrive: false, weapon: 'gatling', gatlingFiring: 0, flaming: false, flamePower: 0, railCharging: false, railProgress: 0, railFull: false };
const w = window as unknown as { __start: () => Promise<void>; __label: string; __done: boolean };
const g = (document.getElementById('c') as HTMLCanvasElement).getContext('2d')!;
w.__start = async () => {
  setSoundEnabled(true); unlockAudio();
  await new Promise((r) => setTimeout(r, 300));
  const dyn = new DynamoSound(), fired = new Set<string>();
  const t0 = performance.now();
  let revs = 0, last = t0;
  await new Promise<void>((done) => {
    const tick = (now: number) => {
      const t = (now - t0) / 1000, dt = (now - last) / 1000; last = now;
      let i = 0; while (i + 1 < STEPS.length && STEPS[i + 1].at <= t) i++;
      const st = STEPS[i], next = STEPS[i + 1]?.at ?? END;
      const inp = { ...base, ...st.set((t - st.at) / (next - st.at)) };
      revs += (inp.cadence / 60) * dt; inp.crankRevs = revs;
      dyn.update(inp, t, dt);
      for (const s of STEPS) for (const [at, name] of s.shots ?? []) { const key = `${at}${name}`; if (t >= at && !fired.has(key)) { fired.add(key); play(name); dyn.cue(name === 'railShot' ? 'rail' : name); } }
      w.__label = st.label;
      g.fillStyle = '#111'; g.fillRect(0, 0, 1280, 360);
      g.fillStyle = '#ff9a3a'; g.font = '800 30px system-ui'; g.fillText(st.label, 30, 60);
      g.fillStyle = '#e8ded0'; g.font = '600 24px system-ui';
      g.fillText(`cadence ${inp.cadence.toFixed(0)} rpm · power ${(inp.ftpFraction * 100).toFixed(0)}% FTP${inp.overdrive ? ' · OVERDRIVE' : ''}`, 30, 110);
      g.fillStyle = '#333'; g.fillRect(30, 150, 1220, 18); g.fillStyle = '#45d2ff'; g.fillRect(30, 150, 1220 * Math.min(1, inp.cadence / 120), 18);
      g.fillStyle = '#333'; g.fillRect(30, 190, 1220, 18); g.fillStyle = '#ff6a2a'; g.fillRect(30, 190, 1220 * Math.min(1, inp.ftpFraction / 1.5), 18);
      g.fillStyle = '#888'; g.font = '500 18px system-ui'; g.fillText(`t = ${t.toFixed(1)} s`, 30, 330);
      if (t < END) requestAnimationFrame(tick); else { dyn.stop(); w.__done = true; done(); }
    };
    requestAnimationFrame(tick);
  });
};
