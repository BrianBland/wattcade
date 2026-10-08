import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { GameModule, MediaTimeline, Profile } from '../../contracts';
import { buildTimeline, matchesQuery, planMix, rateQueue, type QueueMode, type SongAnalysis, type SongMeta } from '../../media';
import { mediaLibrary, unlockMedia } from '../services';
import { onMenuPress } from '../menuInput';
import { KeyHints, Spinner } from '../components/ui';
import { Btn } from '../components/Bits';
import { toast } from '../components/Toasts';
import { duckAmbient, play as sfx } from '../../audio/sfx';
import type { MediaRun } from '../types';
import { fmtTime, MODES, moveItem, nextMode, pickerNav, previewStart, queueRows, SECTION_COLORS, type PickerFocus } from './pickerModel';

const TABS = ['My music', 'Samples (CC)', 'Generated', '+ Add music'] as const;
const ADD_TAB = 3;
const PREVIEW_S = 20;
const queueKey = (p: Profile) => `wattcade.media.queue.${p.id}`;
function loadQueue(p: Profile): { ids: string[]; mode: QueueMode } {
  try { const v = JSON.parse(localStorage.getItem(queueKey(p)) ?? ''); if (Array.isArray(v.ids)) return { ids: v.ids, mode: v.mode ?? 'automix' }; } catch { /* none yet */ }
  return { ids: [], mode: 'automix' };
}

/** Pick songs for a music game: library / demo list with search, a song preview, and the queue (play mode + Start). */
export function MediaPicker({ game, profile, onStart, onBack }: { game: GameModule; profile: Profile; onStart: (run: MediaRun) => void; onBack: () => void }) {
  const lib = mediaLibrary();
  const [local, setLocal] = useState<SongMeta[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [samples, setSamples] = useState<SongMeta[]>([]);
  const [tab, setTab] = useState(0);
  const [query, setQuery] = useState('');
  const initial = useMemo(() => loadQueue(profile), [profile.id]);
  const [queue, setQueue] = useState<string[]>(initial.ids);
  const [mode, setMode] = useState<QueueMode>(initial.mode);
  const [focus, setFocus] = useState<PickerFocus>({ zone: 'list', tab: 0, list: 0, queue: 0 });
  const [timeline, setTimeline] = useState<MediaTimeline | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [, bump] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  // library contents (and live analysis progress)
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      void lib.localSongs().then((s) => { if (alive) { setLocal(s); setLoaded(true); bump((x) => x + 1); } });
      void lib.sampleSongs().then((s) => { if (alive) setSamples(s); });
    };
    refresh();
    const off = lib.subscribe(refresh);
    return () => { alive = false; off(); };
  }, []);
  useEffect(() => { if (loaded && !local.length && tab === 0 && !query) setTab(1); }, [loaded]); // no songs yet: show the samples
  const demos = useMemo(() => lib.demoSongs(), []);
  const all = useMemo(() => new Map([...demos, ...samples, ...local].map((m) => [m.id, m])), [demos, samples, local]);
  const list = (tab === 1 ? samples : tab === 2 ? demos : local).filter((m) => matchesQuery(m, query) || (m.genre ? matchesQuery({ title: m.genre, artist: '', album: '' }, query) : false));
  const queued = queue.map((id) => all.get(id)).filter((m): m is SongMeta => !!m);
  const ready = queued.length > 0 && queued.every((m) => m.status === 'ready');

  useEffect(() => { localStorage.setItem(queueKey(profile), JSON.stringify({ ids: queue, mode })); }, [queue, mode]);
  // queue → program timeline (for the strip, the game's preview and the stats)
  useEffect(() => {
    let alive = true;
    if (!ready) { setTimeline(null); return; }
    void Promise.all(queue.map((id) => lib.mixItem(id))).then((items) => {
      if (!alive || items.some((i) => !i)) return;
      const its = items as NonNullable<(typeof items)[number]>[];
      setTimeline(buildTimeline(planMix(its, mode), its));
    });
    return () => { alive = false; };
  }, [queue.join('|'), mode, ready]);

  const focusedSong: SongMeta | undefined = focus.zone === 'queue' ? queued[focus.queue - 1] : list[focus.list];
  const [analysis, setAnalysis] = useState<SongAnalysis | null>(null);
  useEffect(() => {
    let alive = true; setAnalysis(null);
    if (focusedSong?.status === 'ready') void lib.analysis(focusedSong.id).then((a) => { if (alive) setAnalysis(a ?? null); });
    return () => { alive = false; };
  }, [focusedSong?.id, focusedSong?.status]);

  const stopPreview = () => { const a = audio.current; if (a) { a.pause(); a.removeAttribute('src'); } setPreviewing(null); };
  useEffect(() => { duckAmbient('picker', true); return () => { duckAmbient('picker', false); stopPreview(); }; }, []); // music screen: no scenery hiss
  const previewingRef = useRef<string | null>(null); previewingRef.current = previewing;
  const togglePreview = async (m: SongMeta | undefined) => {
    if (!m || m.status !== 'ready') return;
    if (previewingRef.current === m.id) { stopPreview(); return; }
    try {
      const a = audio.current ?? (audio.current = Object.assign(new Audio(), { preload: 'auto' }));
      const an = await lib.analysis(m.id);
      a.src = await lib.audioUrl(m.id);
      a.currentTime = an ? previewStart(an.sections, an.durationS) : m.durationS / 3;
      a.volume = 0.8;
      setPreviewing(m.id);
      await a.play();
      const id = m.id;
      setTimeout(() => { if (audio.current?.src && audio.current.currentTime > 0) setPreviewing((cur) => { if (cur === id) { audio.current?.pause(); return null; } return cur; }); }, PREVIEW_S * 1000);
    } catch { toast('Tap the song to preview it (iPad needs a touch to start audio)'); setPreviewing(null); }
  };

  const add = (m: SongMeta | undefined) => {
    if (!m) return;
    if (m.status === 'error') { lib.retry(m.id); toast(`Retrying analysis of ${m.title}`); return; }
    if (m.status === 'remote') void lib.downloadSample(m.id).catch((e) => toast(`Couldn't download ${m.title}: ${e instanceof Error ? e.message : e}`));
    setQueue((q) => [...q, m.id]); sfx('uiSelect');
  };
  const removeAt = (i: number) => setQueue((q) => q.filter((_, j) => j !== i));
  const pickFiles = () => fileInput.current?.click();
  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const added = await lib.importFiles(files);
    setTab(0); toast(`Added ${added.length} song${added.length === 1 ? '' : 's'} · analyzing…`, 'good');
  };
  const start = async () => {
    if (!ready) { toast(queued.length ? 'Waiting for analysis to finish…' : 'Add a song to the queue first'); sfx('deny'); return; }
    stopPreview(); unlockMedia();
    const items = (await Promise.all(queue.map((id) => lib.mixItem(id)))).filter((i): i is NonNullable<typeof i> => !!i);
    const plan = planMix(items, mode);
    onStart({ ids: queue, mode, items, plan, timeline: buildTimeline(plan, items) });
  };

  // controller / keyboard
  // the listener is registered once; it always reads the latest state and handlers through this ref
  const st = useRef({ focus, list, queued, add, start, togglePreview, removeAt, pickFiles, stopPreview, onBack });
  st.current = { focus, list, queued, add, start, togglePreview, removeAt, pickFiles, stopPreview, onBack };
  useEffect(() => onMenuPress((p) => {
    const { focus: f, list: l, queued: q, add, start, togglePreview, removeAt, pickFiles, stopPreview, onBack } = st.current;
    const size = { tabs: TABS.length, list: l.length, queue: q.length };
    for (const k of ['up', 'down', 'left', 'right'] as const) if (p.has(k)) {
      const n = pickerNav(f, k, size);
      if (n !== f) { sfx('uiMove'); setFocus(n); if (n.zone === 'tabs' && n.tab !== f.tab && n.tab < ADD_TAB) setTab(n.tab); }
    }
    if (p.has('a')) {
      if (f.zone === 'tabs') { if (f.tab === ADD_TAB) pickFiles(); else setTab(f.tab); }
      else if (f.zone === 'list') add(l[f.list]);
      else if (f.queue === 0) { setMode((m) => nextMode(m)); sfx('uiTick'); }
      else if (f.queue === queueRows(q.length) - 1) void start();
      else { removeAt(f.queue - 1); sfx('uiBack'); }
    }
    if (p.has('y')) { if (f.zone === 'queue' && f.queue >= 2 && f.queue <= q.length) { setQueue((x) => moveItem(x, f.queue - 1, -1)); setFocus({ ...f, queue: f.queue - 1 }); } else void togglePreview(f.zone === 'queue' ? q[f.queue - 1] : l[f.list]); }
    if (p.has('b')) { stopPreview(); sfx('uiBack'); onBack(); }
  }), []);

  const rating = timeline ? rateQueue(timeline) : null;
  const zoneIs = (z: PickerFocus['zone']) => focus.zone === z;
  return (
    <div class="screen media-picker">
      <div class="screen-head">
        <div><h1>Pick your music</h1><div class="sub">{game.title} · {queued.length ? `${queued.length} in the queue` : 'add songs to the queue'}</div></div>
        <span class="spacer" />
        <Btn small onClick={() => { stopPreview(); onBack(); }}>Back</Btn>
      </div>
      <div class="mp-cols">
        <div class="panel mp-library">
          <div class="mp-tabs">
            {TABS.map((t, i) => (
              <button type="button" class={`btn small${tab === i && i < ADD_TAB ? ' primary' : ''}${zoneIs('tabs') && focus.tab === i ? ' focused' : ''}`}
                onClick={() => { unlockMedia(); if (i === ADD_TAB) pickFiles(); else setTab(i); setFocus({ ...focus, zone: 'tabs', tab: i }); }}>{t}</button>
            ))}
            <input ref={fileInput} type="file" multiple accept="audio/*,.mp3,.m4a,.aac,.flac,.wav" style={{ display: 'none' }}
              onChange={(e) => { void onFiles((e.target as HTMLInputElement).files); (e.target as HTMLInputElement).value = ''; }} />
          </div>
          <input class="mp-search" placeholder="Search title, artist, album" value={query} onInput={(e) => setQuery((e.target as HTMLInputElement).value)} />
          <div class="mp-list">
            {!list.length && <div class="dim mp-empty">{tab === 0 ? (query ? 'No matches.' : 'No songs yet. Choose "+ Add music" to pick files from your iPad (MP3, M4A, FLAC, WAV).') : 'No matches.'}</div>}
            {list.map((m, i) => (
              <SongRow m={m} focused={zoneIs('list') && focus.list === i} progress={lib.progress.get(m.id)} previewing={previewing === m.id}
                onClick={() => { unlockMedia(); setFocus({ ...focus, zone: 'list', list: i }); }} onAdd={() => add(m)} onPreview={() => void togglePreview(m)}
                onRemove={m.source === 'local' ? () => { if (confirm(`Remove "${m.title}" from your library?`)) { setQueue((q) => q.filter((x) => x !== m.id)); void lib.remove(m.id); } } : undefined} />
            ))}
          </div>
        </div>
        <div class="panel mp-preview">
          {focusedSong ? <SongPreview m={focusedSong} analysis={analysis} /> : <div class="dim">Highlight a song to preview it.</div>}
        </div>
        <div class="panel mp-queue">
          <div class={`mp-mode${zoneIs('queue') && focus.queue === 0 ? ' focused' : ''}`}>
            {MODES.map((x) => <button type="button" class={`btn small${mode === x.value ? ' primary' : ''}`} onClick={() => setMode(x.value)}>{x.label}</button>)}
            <small class="dim">{MODES.find((x) => x.value === mode)?.hint}</small>
          </div>
          <div class="mp-qlist">
            {!queued.length && <div class="dim mp-empty">Press A on a song (or tap +) to queue it.</div>}
            {queued.map((m, i) => (
              <div class={`mp-qrow${zoneIs('queue') && focus.queue === i + 1 ? ' focused' : ''}`} onClick={() => setFocus({ ...focus, zone: 'queue', queue: i + 1 })}>
                <span class="mp-swatch" style={{ background: m.palette?.[0] ?? '#444' }} />
                <span class="mp-title"><b>{m.title}</b><small class="dim">{m.artist}{m.status === 'ready' ? ` · ${Math.round(m.bpm ?? 0)} bpm` : ''}</small></span>
                {m.status !== 'ready' && <StatusChip m={m} progress={lib.progress.get(m.id)} />}
                <span class="dim mp-num">{m.durationS ? fmtTime(m.durationS) : ''}</span>
                <button type="button" class="step" title="Move up" onClick={(e) => { e.stopPropagation(); setQueue((q) => moveItem(q, i, -1)); }}>▲</button>
                <button type="button" class="step" title="Remove" onClick={(e) => { e.stopPropagation(); removeAt(i); }}>✕</button>
              </div>
            ))}
          </div>
          {timeline && <QueueStrip timeline={timeline} />}
          {timeline && game.mediaPreview && <GamePreview game={game} timeline={timeline} profile={profile} />}
          {rating && <div class="mp-stats">{fmtTime(rating.durationS)} · {rating.songs} song{rating.songs === 1 ? '' : 's'} · {rating.drops} drop{rating.drops === 1 ? '' : 's'} · {rating.bpmMin === rating.bpmMax ? rating.bpmMin : `${rating.bpmMin}–${rating.bpmMax}`} bpm · <span class="mp-stars">{'★'.repeat(rating.stars)}<span class="dim">{'★'.repeat(5 - rating.stars)}</span></span></div>}
          <Btn primary focused={zoneIs('queue') && focus.queue === queueRows(queued.length) - 1} disabled={!ready} onClick={() => void start()}>
            {ready ? '▶ Start ride' : queued.length ? <><Spinner /> Analyzing…</> : 'Queue is empty'}
          </Btn>
        </div>
      </div>
      <KeyHints hints={[['dpad', 'Move'], ['a', focus.zone === 'queue' ? (focus.queue === 0 ? 'Play mode' : focus.queue > queued.length ? 'Start' : 'Remove') : 'Add to queue'], ['y', focus.zone === 'queue' && focus.queue >= 2 && focus.queue <= queued.length ? 'Move up' : 'Preview'], ['b', 'Back']]} />
    </div>
  );
}

function StatusChip({ m, progress }: { m: SongMeta; progress?: { p: number; stage: string } }) {
  if (m.status === 'ready') return <span class="mp-chip">{Math.round(m.bpm ?? 0)} bpm · {m.key}</span>;
  if (m.status === 'error') return <span class="mp-chip bad" title={m.error}>⚠ couldn't read</span>;
  if (m.status === 'remote') return <span class="mp-chip">{m.genre ? `${m.genre} · ` : ''}↓ {Math.round((m.size ?? 0) / 1e6)} MB</span>;
  if (progress?.stage === 'downloading') return <span class="mp-chip"><Spinner /> downloading</span>;
  return <span class="mp-chip"><Spinner /> {progress ? `${Math.round(progress.p * 100)}%` : m.status === 'pending' ? 'queued' : '…'}</span>;
}

function SongRow({ m, focused, progress, previewing, onClick, onAdd, onPreview, onRemove }: {
  m: SongMeta; focused: boolean; progress?: { p: number; stage: string }; previewing: boolean;
  onClick: () => void; onAdd: () => void; onPreview: () => void; onRemove?: () => void;
}) {
  return (
    <div class={`mp-row${focused ? ' focused' : ''}`} onClick={onClick}>
      <span class="mp-swatch" style={{ background: m.palette ? `linear-gradient(135deg, ${m.palette[0]}, ${m.palette[1] ?? m.palette[0]})` : '#333' }} />
      <span class="mp-title"><b>{m.title}</b><small class="dim">{m.artist}{m.album ? ` · ${m.album}` : ''}</small></span>
      <StatusChip m={m} progress={progress} />
      <span class="dim mp-num">{m.durationS ? fmtTime(m.durationS) : ''}</span>
      <button type="button" class="step" title="Preview" disabled={m.status !== 'ready'} onClick={(e) => { e.stopPropagation(); onPreview(); }}>{previewing ? '■' : '▶'}</button>
      <button type="button" class="step" title="Add to queue" onClick={(e) => { e.stopPropagation(); onAdd(); }}>+</button>
      {onRemove && <button type="button" class="step" title="Remove from library" onClick={(e) => { e.stopPropagation(); onRemove(); }}>🗑</button>}
    </div>
  );
}

function SongPreview({ m, analysis }: { m: SongMeta; analysis: SongAnalysis | null }) {
  const [art, setArt] = useState<string | null>(null);
  useEffect(() => { let alive = true; setArt(null); if (m.hasArt) void mediaLibrary().artUrl(m.id).then((u) => { if (alive) setArt(u); }); return () => { alive = false; }; }, [m.id]);
  const pal = m.palette ?? [];
  return (
    <div class="mp-song">
      <div class="mp-cover" style={{ background: art ? `center/cover url(${art})` : pal.length ? `linear-gradient(135deg, ${pal.slice(0, 3).join(', ')})` : '#222' }} />
      <div class="mp-meta">
        <h3>{m.title}</h3>
        <div>{m.artist}{m.album ? <span class="dim"> · {m.album}</span> : null}</div>
        {m.status === 'ready' && <div class="dim">{fmtTime(m.durationS)} · {Math.round(m.bpm ?? 0)} bpm · key {m.key} · {m.drops ?? 0} drop{m.drops === 1 ? '' : 's'}</div>}
        {pal.length > 0 && <div class="mp-pal">{pal.map((c) => <i style={{ background: c }} />)}</div>}
        {m.credit && <a class="mp-credit" href={m.credit.url} target="_blank" rel="noopener">{m.credit.text}</a>}
      </div>
      {analysis ? <SpecStrip a={analysis} /> : m.status === 'ready' ? <Spinner /> : <div class="dim">{m.status === 'remote' ? 'Press A (or +) to download and queue it.' : 'The preview appears once the song is analyzed.'}</div>}
    </div>
  );
}

const useCanvas = (draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, deps: unknown[]) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const paint = () => {
      const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
      c.width = Math.max(1, Math.round(c.clientWidth * dpr)); c.height = Math.max(1, Math.round(c.clientHeight * dpr));
      const g = c.getContext('2d'); if (!g) return;
      try { draw(g, c.width, c.height); } catch { /* previews must never break the picker */ }
    };
    paint();
    const ro = new ResizeObserver(paint); ro.observe(c);
    return () => ro.disconnect();
  }, deps);
  return ref;
};

/** Spectrogram (mel, low at the bottom) with the section strip under it. */
function SpecStrip({ a }: { a: SongAnalysis }) {
  const ref = useCanvas((g, w, h) => {
    const bytes = atob(a.spec.data), nb = a.spec.bands, cols = Math.floor(bytes.length / nb);
    const sh = Math.round(h * 0.78), strip = h - sh;
    const img = g.createImageData(w, sh);
    for (let x = 0; x < w; x++) {
      const c = Math.min(cols - 1, Math.floor((x / w) * cols));
      for (let y = 0; y < sh; y++) {
        const b = Math.min(nb - 1, Math.floor(((sh - 1 - y) / sh) * nb));
        const v = bytes.charCodeAt(c * nb + b) / 255;
        const i = (y * w + x) * 4;
        img.data[i] = Math.min(255, 40 + 255 * v * 1.4); img.data[i + 1] = Math.min(255, 255 * v * v * 1.1); img.data[i + 2] = Math.min(255, 90 + 200 * v); img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    for (const s of a.sections) {
      g.fillStyle = SECTION_COLORS[s.kind] ?? '#888';
      const x0 = (s.t0 / a.durationS) * w, x1 = (s.t1 / a.durationS) * w;
      g.fillRect(x0, sh + 2, Math.max(1, x1 - x0 - 2), strip - 2);
    }
  }, [a]);
  return (
    <div class="mp-spec">
      <canvas ref={ref} />
      <div class="mp-legend">{(['intro', 'verse', 'build', 'drop', 'break', 'outro'] as const).filter((k) => a.sections.some((s) => s.kind === k)).map((k) => <span><i style={{ background: SECTION_COLORS[k] }} />{k}</span>)}</div>
    </div>
  );
}

/** The whole queue: intensity over program time on section colours, song boundaries marked. */
function QueueStrip({ timeline: tl }: { timeline: MediaTimeline }) {
  const ref = useCanvas((g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (const s of tl.sections) { g.fillStyle = (SECTION_COLORS[s.kind] ?? '#888') + '55'; g.fillRect((s.t0 / tl.durationS) * w, 0, ((s.t1 - s.t0) / tl.durationS) * w, h); }
    g.strokeStyle = '#fff'; g.lineWidth = Math.max(1, h / 40); g.beginPath();
    tl.intensity.forEach((v, i) => { const x = (i / tl.intensity.length) * w, y = h - 2 - v * (h - 4); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
    g.stroke();
    g.fillStyle = '#000a';
    for (const s of tl.songs.slice(1)) g.fillRect((s.t0 / tl.durationS) * w - 1, 0, 2, h);
  }, [tl]);
  return <canvas class="mp-qstrip" ref={ref} />;
}

function GamePreview({ game, timeline, profile }: { game: GameModule; timeline: MediaTimeline; profile: Profile }) {
  const ref = useCanvas((g, w, h) => { g.clearRect(0, 0, w, h); game.mediaPreview?.(g, w, h, timeline, profile); }, [game, timeline]);
  return <canvas class="mp-gpreview" ref={ref} />;
}
