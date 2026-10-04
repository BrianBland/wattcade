import { useEffect, useRef, useState } from 'preact/hooks';
import type { GameModule, MediaTimeline } from '../../contracts';
import { ProgramSync } from '../../media/clock';
import { mediaEngine, unlockMedia } from '../services';
import { defaultProfile } from '../../progression';
import { MediaPicker } from './MediaPicker';
import { fmtTime, SECTION_COLORS } from './pickerModel';
import type { MediaRun } from '../types';

/**
 * Music Lab (/media-lab.html): try the media core on a device without a game. Pick a queue, play it through the
 * mixer, and watch the program clock, beats, sections, a simulated sim locked by ProgramSync, and calibrate latency
 * by tapping along.
 */
const labGame: GameModule = {
  id: 'musiclab', title: 'Music Lab', blurb: '', tags: [], requires: { media: ['pcm'] },
  createSim: () => { throw new Error('lab only'); }, loadRenderer: () => Promise.reject(new Error('lab only')),
  mediaPreview(g, w, h, tl) {
    g.fillStyle = '#fff3';
    for (const t of tl.downbeats) g.fillRect((t / tl.durationS) * w, 0, 1, h);
    g.fillStyle = '#00f0ff';
    for (const o of tl.onsets) if (o.band === 0 && o.s > 0.4) g.fillRect((o.t / tl.durationS) * w, h * 0.6, 1, h * 0.4 * o.s);
  },
};
const LAT_KEY = 'wattcade.media.latencyMs';

export function MusicLab() {
  const profile = useRef(defaultProfile('Lab')).current;
  const [run, setRun] = useState<MediaRun | null>(null);
  if (!run) return <MediaPicker game={labGame} profile={profile} onStart={setRun} onBack={() => history.back()} />;
  return <LabPlayer run={run} onStop={() => setRun(null)} />;
}

function LabPlayer({ run, onStop }: { run: MediaRun; onStop: () => void }) {
  const tl: MediaTimeline = run.timeline;
  const canvas = useRef<HTMLCanvasElement>(null);
  const [info, setInfo] = useState<Record<string, string | number | boolean>>({});
  const taps = useRef<number[]>([]);
  const [latMs, setLatMs] = useState(() => Number(localStorage.getItem(LAT_KEY) ?? 0));
  const [suggest, setSuggest] = useState<number | null>(null);
  const engine = mediaEngine();
  const pos = useRef(0);

  useEffect(() => {
    engine.load(run.plan); engine.setVolume(1); void engine.start(0);
    const sync = new ProgramSync();
    let sim = 0, raf = 0, last = performance.now(), beatIdx = 0, flash = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      const audio = engine.positionS();
      sim += dt * sync.update(audio, sim, engine.playing());
      pos.current = audio ?? sim;
      while (beatIdx < tl.beats.length && tl.beats[beatIdx] <= sim) { beatIdx++; flash = 1; }
      flash = Math.max(0, flash - dt * 6);
      draw(sim, flash);
      const song = tl.songs.find((s) => sim >= s.t0 && sim < s.t1), sec = tl.sections.find((s) => sim >= s.t0 && sim < s.t1);
      setInfo({ program: fmtTime(sim), song: song ? `${song.title} — ${song.artist}` : '–', ...(song?.credit ? { credit: song.credit.text } : {}), section: sec?.kind ?? '–', bpm: song?.bpm ?? 0,
        syncErrMs: Math.round(sync.errS * 1000), trim: +sync.trim.toFixed(3), ...engine.debug() });
      raf = requestAnimationFrame(frame);
    };
    const draw = (p: number, fl: number) => {
      const c = canvas.current; if (!c) return;
      const dpr = Math.min(2, devicePixelRatio || 1); c.width = c.clientWidth * dpr; c.height = c.clientHeight * dpr;
      const g = c.getContext('2d')!, w = c.width, h = c.height, span = 8, x = (t: number) => ((t - p + 2) / span) * w;
      g.fillStyle = `rgb(${10 + fl * 60},${8 + fl * 40},${24 + fl * 80})`; g.fillRect(0, 0, w, h);
      for (const s of tl.sections) { if (s.t1 < p - 2 || s.t0 > p + span) continue; g.fillStyle = (SECTION_COLORS[s.kind] ?? '#888') + '44'; g.fillRect(x(s.t0), 0, x(s.t1) - x(s.t0), h * 0.12); }
      for (const t of tl.beats) { if (t < p - 2 || t > p - 2 + span) continue; const down = tl.downbeats.includes(t); g.fillStyle = down ? '#ffffffcc' : '#ffffff44'; g.fillRect(x(t) - 1, h * 0.12, down ? 3 : 1, h * 0.88); }
      const lane = [0.85, 0.6, 0.35], col = ['#ff2bd6', '#b6ff3b', '#00f0ff'];
      for (const o of tl.onsets) { if (o.t < p - 2 || o.t > p - 2 + span) continue; g.fillStyle = col[o.band]; const r = 3 + 9 * o.s; g.beginPath(); g.arc(x(o.t), h * lane[o.band], r * dpr, 0, 7); g.fill(); }
      g.fillStyle = '#fff'; g.fillRect(x(p) - 1.5, 0, 3, h);
      const k = Math.min(tl.intensity.length - 1, Math.floor(p * tl.hz)); g.fillStyle = '#ffb020'; g.fillRect(0, h - 8, w * (tl.intensity[k] ?? 0), 8);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); engine.stop(); };
  }, [run]);

  const tap = () => {
    unlockMedia();
    const p = engine.positionS(); if (p === null) return;
    // offset to the nearest beat, as heard
    let best = Infinity; for (const b of tl.beats) if (Math.abs(b - p) < Math.abs(best)) best = b - p;
    if (Math.abs(best) > 0.25) return;
    taps.current = [...taps.current.slice(-15), best];
    if (taps.current.length >= 8) {
      const xs = [...taps.current].sort((a, b) => a - b), med = xs[xs.length >> 1];
      setSuggest(Math.round(latMs - med * 1000)); // tapping late (−) means we report the beat too early → add latency
    }
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); tap(); } else if (e.key === 'Escape') onStop(); };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  });

  return (
    <div class="screen music-lab">
      <div class="screen-head"><div><h1>Music Lab</h1><div class="sub">{run.mode} · {run.plan.transitions.map((t) => t.kind).join(', ') || 'one song'}</div></div><span class="spacer" />
        <button class="btn small" onClick={() => engine.pause()}>Pause</button><button class="btn small" onClick={() => engine.resume()}>Resume</button>
        <button class="btn small" onClick={() => engine.seek(Math.max(0, (engine.positionS() ?? 0) + 30))}>+30 s</button>
        <button class="btn small" onClick={onStop}>Back</button></div>
      <canvas ref={canvas} class="lab-canvas" onPointerDown={tap} />
      <div class="panel lab-info">
        {Object.entries(info).map(([k, v]) => <div><span class="dim">{k}</span> <b>{String(v)}</b></div>)}
      </div>
      <div class="panel row">
        <span>Tap the canvas (or Space) on every beat for ~10 s to calibrate latency.</span><span class="spacer" />
        <span>Now: <b>{latMs} ms</b>{suggest !== null && <> · suggested <b>{suggest} ms</b> ({taps.current.length} taps)</>}</span>
        {suggest !== null && <button class="btn small primary" onClick={() => { localStorage.setItem(LAT_KEY, String(suggest)); setLatMs(suggest); taps.current = []; setSuggest(null); }}>Use it</button>}
        <button class="btn small" onClick={() => { localStorage.setItem(LAT_KEY, '0'); setLatMs(0); }}>Reset</button>
      </div>
    </div>
  );
}
