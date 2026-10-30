import { createMediaTimings } from '../../media/online/timing';
import { MediaTimingStats } from './MediaTimingStats';
import { BufferProgress } from './BufferProgress';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { GameModule, MediaTimeline, Profile } from '../../contracts';
import { buildTimeline, searchOnline, mediaServerConfig, subscribeMediaServer, estimatedAnalysis, type OnlineProvider, matchesQuery, planMix, rateQueue, type QueueMode, type SongAnalysis, type SongMeta, PreviewPrefetch, type PartialPreview } from '../../media';
import { prepareStreamWindow, mediaLibrary, rollingMediaRun, unlockMedia } from '../services';
import { onMenuPress } from '../menuInput';
import { KeyHints, Spinner } from '../components/ui';
import { Btn } from '../components/Bits';
import { toast } from '../components/Toasts';
import { duckAmbient, play as sfx } from '../../audio/sfx';
import type { MediaRun } from '../types';
import { loadQueue as loadPersistedQueue, queueIds, queueStorageKey, serializeQueue } from '../../media/queue';
import { canPreview, fmtTime, MODES, moveItem, nextMode, pickerNav, previewIntent, previewStart, queueRows, SECTION_COLORS, UNDO_MS, type PendingRemoval, type PickerFocus, type PreviewTrigger } from './pickerModel';
import { useSearchKeyboard } from './useSearchKeyboard';

const TABS = ['My music', 'Samples (CC)', 'Generated', 'Online music', '+ Add music'] as const;
const ADD_TAB = 4;
const PREVIEW_S = 20;
// Queue persistence v2 (src/media/queue). Old `{ ids, mode }` data is ignored and cleared; no migration.
function loadQueue(p: Profile): { ids: string[]; mode: QueueMode } {
  try { const q = loadPersistedQueue(localStorage, p.id); return { ids: queueIds(q.entries), mode: q.mode }; } catch { return { ids: [], mode: 'automix' }; }
}

/** Pick songs for a music game: library / demo list with search, a song preview, and the queue (play mode + Start). */
export function MediaPicker({ game, profile, onStart, onBack }: { game: GameModule; profile: Profile; onStart: (run: MediaRun) => void; onBack: () => void }) {
  const lib = mediaLibrary();
  const [local, setLocal] = useState<SongMeta[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [samples, setSamples] = useState<SongMeta[]>([]);
  const [tab, setTab] = useState(0);
  const [query, setQuery] = useState('');
  const [provider, setProvider] = useState<OnlineProvider>('youtube');
  const [online, setOnline] = useState<SongMeta[]>([]);
  const [resolver, setResolver] = useState(mediaServerConfig);
  const [searching, setSearching] = useState(false);
  const [onlineError, setOnlineError] = useState('');
  const searchInput = useRef<HTMLInputElement>(null);
  const keyboard = useSearchKeyboard(searchInput);
  const searchAbort = useRef<AbortController | null>(null);
  useEffect(() => () => searchAbort.current?.abort(), []);
  useEffect(() => subscribeMediaServer(() => setResolver(mediaServerConfig())), []);
  const discover = async () => {
    if (!resolver.enabled) return;
    searchAbort.current?.abort();
    const controller = new AbortController(); searchAbort.current = controller;
    prefetch.current?.pause(true);
    setSearching(true); setOnlineError(''); setOnline([]);
    try {
      const songs = await searchOnline(provider, query, resolver, controller.signal);
      if (!controller.signal.aborted) { setOnline(songs); setFocus((f) => ({ ...f, list: 0 })); if (!songs.length) setOnlineError('No matching tracks. Try another search or paste an individual track URL.'); }
    } catch (e) { if (!controller.signal.aborted) setOnlineError(e instanceof Error ? e.message : String(e)); }
    finally { if (!controller.signal.aborted) setSearching(false); }
  };
  const submitSearch = () => {
    searchInput.current?.blur(); // Dismiss iPad's keyboard on Enter / Search.
    if (tab === 3 && resolver.enabled && !searching && query.trim()) void discover();
  };
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
  const all = useMemo(() => new Map([...demos, ...samples, ...online, ...local].map((m) => [m.id, m])), [demos, samples, online, local]);
  const list = tab === 3 ? online.map((m) => all.get(m.id) ?? m) : (tab === 1 ? samples : tab === 2 ? demos : local).filter((m) => matchesQuery(m, query) || (m.genre ? matchesQuery({ title: m.genre, artist: '', album: '' }, query) : false));
  const queued = queue.map((id) => all.get(id)).filter((m): m is SongMeta => !!m);
  const streaming = queued.some((m) => !!m.sourceUrl);
  const ready = queue.length > 0 && queued.length === queue.length && queued.every((m) => m.sourceUrl ? resolver.enabled && m.durationS > 0 : m.status === 'ready');
  const [starting, setStarting] = useState(false);

  // Streamed songs: prepare playback on enqueue; hand completed audio and analysis to the ride at Start.
  const [, bumpPrefetch] = useState(0);
  const timings = useMemo(() => createMediaTimings(profile.settings), [profile.id, profile.settings.mediaTimingDebug]);
  const makePrefetch = () => new PreviewPrefetch({ load: (song, start, duration, signal) => prepareStreamWindow(song, start, duration, signal, timings), timings, concurrency: 2, firstTrackWindows: Math.ceil(resolver.bufferS / 30), firstTrackFirst: true, onChange: () => bumpPrefetch((x) => x + 1) });
  const prefetch = useRef<PreviewPrefetch | null>(null);
  useEffect(() => {
    const worker = makePrefetch(); prefetch.current = worker;
    worker.setQueue(resolver.enabled ? queued : []); worker.pause(searching);
    return () => worker.cancel();
  }, [profile.id, timings, resolver.bufferS]);
  const pickerAlive = useRef(true);
  useEffect(() => () => { pickerAlive.current = false; prefetch.current?.cancel(); }, []);
  useEffect(() => { prefetch.current?.setQueue(resolver.enabled ? queued : []); }, [queue.join('|'), resolver.enabled, queued.length]);
  useEffect(() => { prefetch.current?.pause(searching); }, [searching]);
  const partialOf = (m: SongMeta | undefined) => (m?.sourceUrl ? prefetch.current?.get(m.id) : undefined);

  useEffect(() => { localStorage.setItem(queueStorageKey(profile.id), serializeQueue(queue.map((songId) => ({ songId, origin: { kind: 'manual' } })), mode)); }, [queue, mode]);
  // queue → program timeline (for the strip, the game's preview and the stats)
  useEffect(() => {
    let alive = true;
    if (!ready) { setTimeline(null); return; }
    void Promise.all(queue.map(async (id) => { const m = all.get(id)!; return m.sourceUrl ? { id, title: m.title, artist: m.artist, palette: m.palette, analysis: estimatedAnalysis(m.durationS) } : lib.mixItem(id); })).then((items) => {
      if (!alive || items.some((i) => !i)) return;
      const its = items as NonNullable<(typeof items)[number]>[];
      setTimeline(buildTimeline(planMix(its, streaming && mode === 'automix' ? 'crossfade' : mode), its));
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

  const previewToken = useRef(0);
  const stopAudio = () => { previewToken.current++; const a = audio.current; if (a) { a.pause(); a.removeAttribute('src'); } setPreviewing(null); };
  const allRef = useRef(all); allRef.current = all;
  /** Start auditioning a song (called by the debounced intent). Failures (e.g. autoplay blocked before any tap) stay quiet. */
  const playPreview = async (id: string) => {
    const m = allRef.current.get(id);
    if (!canPreview(m)) { intent.reset(); return; }
    const token = ++previewToken.current;
    try {
      const a = audio.current ?? (audio.current = Object.assign(new Audio(), { preload: 'auto' }));
      const an = await lib.analysis(id);
      const url = await lib.audioUrl(id);
      if (token !== previewToken.current) return;
      a.src = url;
      a.currentTime = an ? previewStart(an.sections, an.durationS) : m!.durationS / 3;
      a.volume = 0.8;
      setPreviewing(id);
      await a.play();
      setTimeout(() => { if (token === previewToken.current) { intent.reset(); stopAudio(); } }, PREVIEW_S * 1000);
    } catch { if (token === previewToken.current) { intent.reset(); stopAudio(); } }
  };
  const intent = useMemo(() => previewIntent({ start: (id) => void playPreview(id), stop: stopAudio }), []);
  const stopPreview = () => { intent.reset(); stopAudio(); };
  const previewEnter = (m: SongMeta, trigger: PreviewTrigger) => intent.enter(m.id, trigger, canPreview(m));
  const previewLeave = (m: SongMeta) => intent.leave(m.id);
  useEffect(() => { duckAmbient('picker', true); return () => { duckAmbient('picker', false); stopPreview(); }; }, []); // music screen: no scenery hiss
  /** Controller Y: play now / stop. */
  const togglePreview = (m: SongMeta | undefined) => {
    if (!m) return;
    if (!canPreview(m)) { toast(m.sourceUrl ? 'Online songs play once the ride starts' : 'Preview is available once the song is analyzed'); return; }
    if (intent.playing === m.id || previewing === m.id) { stopPreview(); return; }
    stopPreview(); void playPreview(m.id);
  };

  const add = (m: SongMeta | undefined) => {
    if (!m) return;
    if (m.sourceUrl) { void lib.rememberOnline(m).catch((e) => toast(String(e))); setQueue((q) => [...q, m.id]); sfx('uiSelect'); return; }
    if (m.status === 'error') { lib.retry(m.id); toast(`Retrying analysis of ${m.title}`); return; }
    if (m.status === 'remote') void (m.sourceUrl ? lib.prepareOnline(m) : lib.downloadSample(m.id)).catch((e) => toast(`Couldn't load ${m.title}: ${e instanceof Error ? e.message : e}`));
    setQueue((q) => [...q, m.id]); sfx('uiSelect');
  };
  // Removing from the queue and deleting from the library are separate actions; both can be undone for a few seconds.
  const [pending, setPending] = useState<PendingRemoval | null>(null);
  const pendingRef = useRef<{ p: PendingRemoval; h: ReturnType<typeof setTimeout> } | null>(null);
  const commitPending = () => {
    const cur = pendingRef.current; if (!cur) return;
    clearTimeout(cur.h); pendingRef.current = null; setPending(null);
    if (cur.p.kind === 'library') void lib.remove(cur.p.id);
  };
  const beginRemoval = (p: PendingRemoval) => {
    commitPending();
    pendingRef.current = { p, h: setTimeout(commitPending, UNDO_MS) }; setPending(p);
  };
  const undoRemoval = () => {
    const cur = pendingRef.current; if (!cur) return;
    clearTimeout(cur.h); pendingRef.current = null; setPending(null);
    setQueue(cur.p.queueBefore); sfx('uiSelect');
  };
  useEffect(() => () => commitPending(), []);
  const removeAt = (i: number) => {
    const m = queued[i]; if (!m) return;
    if (previewing === m.id) stopPreview();
    beginRemoval({ kind: 'queue', id: m.id, title: m.title, queueBefore: queue });
    setQueue((q) => q.filter((_, j) => j !== i)); sfx('uiBack');
  };
  const deleteFromLibrary = (m: SongMeta) => {
    if (previewing === m.id) stopPreview();
    beginRemoval({ kind: 'library', id: m.id, title: m.title, queueBefore: queue });
    setQueue((q) => q.filter((x) => x !== m.id)); sfx('uiBack');
  };
  const hidden = pending?.kind === 'library' ? pending.id : null;
  const pickFiles = () => fileInput.current?.click();
  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const added = await lib.importFiles(files);
    setTab(0); toast(`Added ${added.length} song${added.length === 1 ? '' : 's'} · analyzing…`, 'good');
  };
  const start = async () => {
    if (!ready) { toast(queued.length ? 'Waiting for analysis to finish…' : 'Add a song to the queue first'); sfx('deny'); return; }
    if (starting) return;
    stopPreview(); unlockMedia();
    setStarting(true);
    try {
    const seeds = await prefetch.current?.takeSeeds();
    if (!pickerAlive.current) return;
    if (streaming) { onStart(await rollingMediaRun(queue, mode, seeds, timings)); return; }
    const items = (await Promise.all(queue.map((id) => lib.mixItem(id)))).filter((i): i is NonNullable<typeof i> => !!i);
    const plan = planMix(items, mode);
    onStart({ ids: queue, mode, items, plan, timeline: buildTimeline(plan, items) });
    } catch (e) { toast(e instanceof Error ? e.message : String(e)); prefetch.current = makePrefetch(); prefetch.current.setQueue(queued); }
    finally { setStarting(false); }
  };

  // Controller/keyboard focus on a list row auditions it after a pause (no button needed).
  useEffect(() => {
    if (focus.zone !== 'list' || !list[focus.list]) { if (intent.pending || intent.playing) stopPreview(); return; }
    previewEnter(list[focus.list], 'focus');
  }, [focus.zone, focus.list, list[focus.list]?.id]);

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
      else removeAt(f.queue - 1);
    }
    if (p.has('y')) { if (f.zone === 'queue' && f.queue >= 2 && f.queue <= q.length) { setQueue((x) => moveItem(x, f.queue - 1, -1)); setFocus({ ...f, queue: f.queue - 1 }); } else togglePreview(f.zone === 'queue' ? q[f.queue - 1] : l[f.list]); }
    if (p.has('b')) { stopPreview(); sfx('uiBack'); onBack(); }
  }), []);

  const rating = timeline ? rateQueue(timeline) : null;
  const zoneIs = (z: PickerFocus['zone']) => focus.zone === z;
  return (
    <div class={`screen media-picker${keyboard ? ' keyboard-open' : ''}`} style={keyboard ? {
      top: `${keyboard.top}px`, left: `${keyboard.left}px`, width: `${keyboard.width}px`, height: `${keyboard.height}px`,
    } : undefined}>
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
          {tab === 3 && <div class="mp-provider">
            <select class="mp-search" aria-label="Music service" value={provider} onChange={(e) => {
              searchAbort.current?.abort(); setSearching(false); setOnline([]); setOnlineError('');
              setProvider((e.target as HTMLSelectElement).value as OnlineProvider);
            }}><option value="youtube">YouTube</option><option value="soundcloud">SoundCloud</option></select>
            <small class="dim">{resolver.enabled ? `Media server enabled · ${resolver.bufferS}s buffer ahead` : 'Enable the optional media server on the Connect screen to search online music.'}</small>
          </div>}
          <form class="mp-search-form" role="search" onSubmit={(e) => {
            e.preventDefault();
            submitSearch();
          }}>
            <input ref={searchInput} type="search" enterKeyHint="search" class="mp-search" aria-label="Search music" placeholder={tab === 3 ? 'Search songs or paste a track URL' : 'Search title, artist, album'} value={query}
              onInput={(e) => setQuery((e.target as HTMLInputElement).value)} onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); submitSearch(); }
              }} />
            {tab === 3 && <button type="submit" class="btn small" disabled={!resolver.enabled || searching || !query.trim()}>{searching ? 'Searching…' : 'Search'}</button>}
          </form>
          <div class="mp-list">
            {tab === 3 && onlineError && <div role="alert">{onlineError}</div>}
            {!list.length && !(tab === 3 && (searching || onlineError)) && <div class="dim mp-empty">{tab === 0 ? (query ? 'No matches.' : 'No songs yet. Choose "+ Add music" to pick files from your iPad (MP3, M4A, FLAC, WAV).') : tab === 3 ? 'Search YouTube or SoundCloud, then tap Add to queue a song.' : 'No matches.'}</div>}
            {list.map((m, i) => m.id === hidden ? null : (
              <SongRow m={m} focused={zoneIs('list') && focus.list === i} progress={lib.progress.get(m.id)} partial={partialOf(m)} previewing={previewing === m.id}
                inQueue={queue.filter((x) => x === m.id).length}
                onClick={() => { unlockMedia(); setFocus({ ...focus, zone: 'list', list: i }); }} onAdd={() => { unlockMedia(); add(m); }}
                onPreviewEnter={(t) => previewEnter(m, t)} onPreviewLeave={() => previewLeave(m)}
                onDelete={m.source === 'local' && !m.sourceUrl ? () => deleteFromLibrary(m) : undefined} />
            ))}
          </div>
        </div>
        <div class="panel mp-preview">
          {focusedSong ? <SongPreview m={focusedSong} analysis={analysis} partial={partialOf(focusedSong)} /> : <div class="dim">Highlight a song to preview it.</div>}
        </div>
        <div class="panel mp-queue">
          <div class={`mp-mode${zoneIs('queue') && focus.queue === 0 ? ' focused' : ''}`}>
            {MODES.map((x) => <button type="button" class={`btn small${mode === x.value ? ' primary' : ''}`} onClick={() => setMode(x.value)}>{x.label}</button>)}
            <small class="dim">{streaming && mode === 'automix' ? 'Estimated crossfades; beat and phrase matching needs full-song analysis.' : MODES.find((x) => x.value === mode)?.hint}</small>
          </div>
          <div class="mp-qlist">
            {!queued.length && <div class="dim mp-empty">Press A on a song (or tap Add) to queue it. Hover or press and hold a song to hear it.</div>}
            {queued.map((m, i) => (
              <div class={`mp-qrow${zoneIs('queue') && focus.queue === i + 1 ? ' focused' : ''}`} onClick={() => setFocus({ ...focus, zone: 'queue', queue: i + 1 })}>
                <span class="mp-swatch" style={{ background: m.palette?.[0] ?? '#444' }} />
                <span class="mp-title"><b>{m.title}</b><small class="dim">{m.status === 'ready' ? `${m.artist} · ${Math.round(m.bpm ?? 0)} bpm` : <StatusChip m={m} progress={lib.progress.get(m.id)} partial={partialOf(m)} />}</small></span>
                <span class="dim mp-num">{m.durationS ? fmtTime(m.durationS) : ''}</span>
                <button type="button" class="step" title="Move up" onClick={(e) => { e.stopPropagation(); setQueue((q) => moveItem(q, i, -1)); }}>▲</button>
                <button type="button" class="btn small mp-qremove" aria-label={`Remove ${m.title} from the queue`} title="Remove from queue (the song stays in your library)" onClick={(e) => { e.stopPropagation(); removeAt(i); }}>✕ Remove</button>
              </div>
            ))}
          </div>
          {timeline && <QueueStrip timeline={timeline} />}
          {timeline && game.mediaPreview && <GamePreview game={game} timeline={timeline} profile={profile} />}
          {rating && !streaming && <div class="mp-stats">{fmtTime(rating.durationS)} · {rating.songs} song{rating.songs === 1 ? '' : 's'} · {rating.drops} drop{rating.drops === 1 ? '' : 's'} · {rating.bpmMin === rating.bpmMax ? rating.bpmMin : `${rating.bpmMin}–${rating.bpmMax}`} bpm · <span class="mp-stars">{'★'.repeat(rating.stars)}<span class="dim">{'★'.repeat(5 - rating.stars)}</span></span></div>}
          {streaming && <div class="dim small">Estimated timing · duration-based crossfades · audio analyzed within the {resolver.bufferS}s buffer. Full-song difficulty is unknown until played.</div>}
          <MediaTimingStats timings={timings} />
          {starting && <BufferProgress read={() => prefetch.current?.progress() ?? null} />}
          <Btn primary focused={zoneIs('queue') && focus.queue === queueRows(queued.length) - 1} disabled={!ready || starting} onClick={() => void start()}>
            {starting ? 'Preparing…' : ready ? '▶ Start ride' : streaming && !resolver.enabled ? 'Enable media server on Connect' : queued.length ? <><Spinner /> Preparing music…</> : 'Queue is empty'}
          </Btn>
        </div>
      </div>
      {pending && <div class="mp-undo" role="status" aria-live="polite">
        <span>{pending.kind === 'library' ? <>Deleted <b>{pending.title}</b> from your library</> : <>Removed <b>{pending.title}</b> from the queue</>}</span>
        <button type="button" class="btn small primary" onClick={undoRemoval}>Undo</button>
        <button type="button" class="btn small" aria-label="Dismiss" onClick={commitPending}>✕</button>
      </div>}
      <KeyHints hints={[['dpad', 'Move'], ['a', focus.zone === 'queue' ? (focus.queue === 0 ? 'Play mode' : focus.queue > queued.length ? 'Start' : 'Remove') : 'Add to queue'], ['y', focus.zone === 'queue' && focus.queue >= 2 && focus.queue <= queued.length ? 'Move up' : 'Play / stop preview'], ['b', 'Back']]} />
    </div>
  );
}

function StatusChip({ m, progress, partial }: { m: SongMeta; progress?: { p: number; stage: string }; partial?: PartialPreview }) {
  if (m.sourceUrl) return <PartialChip p={partial} />;
  if (m.status === 'ready') return <span class="mp-chip">{Math.round(m.bpm ?? 0)} bpm · {m.key}</span>;
  if (m.status === 'error') return <span class="mp-chip bad" title={m.error}>⚠ tap Add to retry</span>;
  if (m.status === 'remote' && m.sourceUrl) return <span class="mp-chip">↓ load</span>;
  if (progress?.stage === 'extracting') return <span class="mp-chip"><Spinner /> extracting audio</span>;
  if (m.status === 'remote') return <span class="mp-chip">{m.genre ? `${m.genre} · ` : ''}↓ {Math.round((m.size ?? 0) / 1e6)} MB</span>;
  if (progress?.stage === 'downloading') return <span class="mp-chip"><Spinner /> downloading</span>;
  return <span class="mp-chip"><Spinner /> {progress ? `${Math.round(progress.p * 100)}%` : m.status === 'pending' ? 'queued' : '…'}</span>;
}

function SongRow({ m, focused, progress, partial, previewing, inQueue, onClick, onAdd, onPreviewEnter, onPreviewLeave, onDelete }: {
  m: SongMeta; focused: boolean; progress?: { p: number; stage: string }; partial?: PartialPreview; previewing: boolean; inQueue: number;
  onClick: () => void; onAdd: () => void; onPreviewEnter: (t: PreviewTrigger) => void; onPreviewLeave: () => void; onDelete?: () => void;
}) {
  const fromButton = (e: Event) => !!(e.target as Element | null)?.closest?.('button, a');
  const audible = canPreview(m);
  return (
    <div class={`mp-row${focused ? ' focused' : ''}${previewing ? ' previewing' : ''}`} onClick={onClick} tabIndex={0}
      aria-label={`${m.title} by ${m.artist}${audible ? '. Hover, focus or press and hold to preview' : ''}`}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') onPreviewEnter('hover'); }}
      onPointerLeave={(e) => { if (e.pointerType === 'mouse') onPreviewLeave(); }}
      onPointerDown={(e) => { if (e.pointerType !== 'mouse' && !fromButton(e)) onPreviewEnter('press'); }}
      onPointerUp={(e) => { if (e.pointerType !== 'mouse') onPreviewLeave(); }}
      onPointerCancel={onPreviewLeave}
      onContextMenu={(e) => { if (audible) e.preventDefault(); }}
      onFocus={(e) => { if (e.target === e.currentTarget) onPreviewEnter('focus'); }}
      onBlur={(e) => { if (e.target === e.currentTarget) onPreviewLeave(); }}
      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onAdd(); } }}>
      <span class="mp-swatch" style={{ background: m.palette ? `linear-gradient(135deg, ${m.palette[0]}, ${m.palette[1] ?? m.palette[0]})` : '#333' }}>
        {previewing && <span class="mp-eq" aria-hidden="true"><i /><i /><i /></span>}
      </span>
      <span class="mp-title"><b>{m.title}</b><small class="dim">{previewing ? <span class="mp-playing">♪ Previewing</span> : <>{m.artist}{m.album ? ` · ${m.album}` : ''}</>}</small>{m.credit && <a class="mp-credit" href={m.credit.url} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()}>{m.credit.text}</a>}</span>
      <StatusChip m={m} progress={progress} partial={partial} />
      <span class="dim mp-num">{m.durationS ? fmtTime(m.durationS) : ''}</span>
      {onDelete && <button type="button" class="mp-delete" aria-label={`Delete ${m.title} from your library`} title="Delete from library (you can undo)" onClick={(e) => { e.stopPropagation(); onDelete(); }}>🗑</button>}
      <button type="button" class={`btn small mp-add${inQueue ? ' queued' : ' primary'}`} aria-label={`Add ${m.title} to the queue`} onClick={(e) => { e.stopPropagation(); onAdd(); }}>
        {inQueue ? <>✓ Queued{inQueue > 1 ? ` ×${inQueue}` : ''} <span class="mp-again">+</span></> : '+ Add'}
      </button>
    </div>
  );
}

function SongPreview({ m, analysis, partial }: { m: SongMeta; analysis: SongAnalysis | null; partial?: PartialPreview }) {
  const [art, setArt] = useState<string | null>(null);
  useEffect(() => { let alive = true; setArt(null); if (m.hasArt) void mediaLibrary().artUrl(m.id).then((u) => { if (alive) setArt(u); }); return () => { alive = false; }; }, [m.id]);
  const pal = m.palette ?? [];
  return (
    <div class="mp-song">
      <div class="mp-cover" style={{ background: art ? `center/cover url(${art})` : pal.length ? `linear-gradient(135deg, ${pal.slice(0, 3).join(', ')})` : '#222' }} />
      <div class="mp-meta">
        <h3>{m.title}</h3>
        <div>{m.artist}{m.album ? <span class="dim"> · {m.album}</span> : null}</div>
        {partial && partial.coveredS > 0 && <div class="dim">{fmtTime(m.durationS)} · ~{Math.round(partial.analysis.bpm)} bpm · key ~{partial.analysis.key.camelot || partial.analysis.key.name} <span class="mp-approx">(from first {fmtTime(partial.coveredS)})</span></div>}
        {m.status === 'ready' && <div class="dim">{fmtTime(m.durationS)} · {Math.round(m.bpm ?? 0)} bpm · key {m.key} · {m.drops ?? 0} drop{m.drops === 1 ? '' : 's'}</div>}
        {pal.length > 0 && <div class="mp-pal">{pal.map((c) => <i style={{ background: c }} />)}</div>}
        {m.credit && <a class="mp-credit" href={m.credit.url} target="_blank" rel="noopener">{m.credit.text}</a>}
      </div>
      {partial ? <PartialStrip p={partial} /> : analysis ? <SpecStrip a={analysis} /> : m.status === 'ready' ? <Spinner /> : <div class="dim">{m.status === 'remote' ? 'Press A (or Add) to queue it. Audio will be analyzed as it buffers.' : 'The preview appears once the song is analyzed.'}</div>}
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

/** Streamed-song analysis state for chips: in progress, partial coverage, busy, or failed. */
function PartialChip({ p }: { p?: PartialPreview }) {
  if (!p) return <span class="mp-chip">JIT analysis</span>;
  const cov = `${fmtTime(p.coveredS)} / ${fmtTime(p.durationS)}`;
  switch (p.state) {
    case 'waiting': return <span class="mp-chip">{p.coveredS ? `partial · ${cov}` : 'analysis queued'}</span>;
    case 'loading': return <span class="mp-chip partial"><Spinner /> {p.coveredS ? `partial · ${cov}` : 'analyzing first 0:30'}</span>;
    case 'partial': return <span class="mp-chip partial" title="Approximate: only part of the song is analyzed. The rest is analyzed while riding.">partial · {cov}</span>;
    case 'complete': return <span class="mp-chip">analyzed · {fmtTime(p.durationS)}</span>;
    case 'busy': return <span class="mp-chip" title="The media server is busy; retrying shortly.">server busy · retrying</span>;
    case 'error': return <span class="mp-chip bad" title={p.error}>⚠ preview unavailable</span>;
  }
}

/** Partial spectrogram for a streamed song: analyzed windows drawn normally, the rest hatched grey. */
function PartialStrip({ p }: { p: PartialPreview }) {
  const ref = useCanvas((g, w, h) => {
    const sh = Math.round(h * 0.78), strip = h - sh, D = p.durationS, X = (t: number) => (t / D) * w;
    g.clearRect(0, 0, w, h);
    for (const win of p.windows) {
      const bytes = atob(win.spec.data), nb = win.spec.bands, cols = Math.floor(bytes.length / Math.max(1, nb));
      const x0 = Math.floor(X(win.startS)), x1 = Math.ceil(X(win.endS)), ww = Math.max(1, x1 - x0);
      if (!cols) continue;
      const img = g.createImageData(ww, sh);
      for (let x = 0; x < ww; x++) {
        const t = win.startS + ((x + 0.5) / ww) * (win.endS - win.startS);
        const c = Math.max(0, Math.min(cols - 1, Math.floor((t - win.bufferStartS) * win.spec.hz)));
        for (let y = 0; y < sh; y++) {
          const b = Math.min(nb - 1, Math.floor(((sh - 1 - y) / sh) * nb)), v = bytes.charCodeAt(c * nb + b) / 255, i = (y * ww + x) * 4;
          img.data[i] = Math.min(255, 40 + 255 * v * 1.4); img.data[i + 1] = Math.min(255, 255 * v * v * 1.1); img.data[i + 2] = Math.min(255, 90 + 200 * v); img.data[i + 3] = 255;
        }
      }
      g.putImageData(img, x0, 0);
    }
    // unanalyzed remainder: grey with diagonal hatching
    const cx = X(p.coveredS);
    g.fillStyle = '#1b1830'; g.fillRect(cx, 0, w - cx, h);
    g.save(); g.beginPath(); g.rect(cx, 0, w - cx, h); g.clip();
    g.strokeStyle = '#ffffff1f'; g.lineWidth = Math.max(1, w / 400);
    for (let x = cx - h; x < w + h; x += Math.max(8, w / 60)) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + h, 0); g.stroke(); }
    g.restore();
    for (const s of p.analysis.sections) {
      if (s.t0 >= p.coveredS) continue;
      g.fillStyle = SECTION_COLORS[s.kind] ?? '#888';
      const x0 = X(s.t0), x1 = X(Math.min(s.t1, p.coveredS));
      g.fillRect(x0, sh + 2, Math.max(1, x1 - x0 - 2), strip - 2);
    }
    if (p.coveredS > 0 && p.coveredS < D) { g.fillStyle = '#ffffffaa'; g.fillRect(cx - 1, 0, 2, h); }
  }, [p, p.windows.length, p.state]);
  const kinds = (['intro', 'verse', 'build', 'drop', 'break', 'outro'] as const).filter((k) => p.analysis.sections.some((s) => s.kind === k && s.t0 < p.coveredS));
  return (
    <div class="mp-spec">
      <canvas ref={ref} aria-label={`Partial analysis: ${fmtTime(p.coveredS)} of ${fmtTime(p.durationS)} analyzed`} />
      <div class="mp-legend">
        <span class="mp-partial-label">{p.state === 'complete' ? `analyzed · ${fmtTime(p.durationS)}` : `partial · ${fmtTime(p.coveredS)} / ${fmtTime(p.durationS)}`}{p.state === 'loading' && <> · <Spinner /> analyzing</>}{p.state === 'busy' && ' · server busy, retrying'}</span>
        {kinds.map((k) => <span><i style={{ background: SECTION_COLORS[k] }} />{k}</span>)}
        {p.coveredS < p.durationS && <span><i class="mp-hatch" />not analyzed yet</span>}
      </div>
      {p.state === 'error' && <div class="dim">Preview unavailable: {p.error}. The song is still analyzed while riding.</div>}
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
