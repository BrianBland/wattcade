import { ANALYSIS_VERSION, type SongAnalysis } from '../types';
import { makeScore, type SynthScore, type SynthStyle } from '../synth/score';
import { scoreAnalysis } from '../synth/truth';
import { synthItem } from '../synth/queue';
import type { MixItem } from '../mix/plan';
import { readTags } from './tags';
import { paletteFromKey, paletteFromPixels } from './palette';
import type { MediaStorage, SongMeta } from './store';
import { SAMPLE_TRACKS, sampleCredit, sampleId, sampleUrl } from './samples';

export type { SongMeta } from './store';

/** Turns a stored audio file into an analysis. Injected so tests can run without Web Audio. */
export type FileAnalyzer = (blob: Blob, progress: (p: number, stage: string) => void) => Promise<SongAnalysis>;
/** Renders a synth score to a playable audio blob. */
export type SynthRenderer = (score: SynthScore) => Promise<Blob>;

export interface LibraryOpts {
  storage: MediaStorage;
  /** Fetch extracted online audio without persisting it to IndexedDB. */
  loadOnlineAudio?: (song: SongMeta) => Promise<Blob>;
  analyze: FileAnalyzer;
  renderSynth?: SynthRenderer;
  /** Cover-art palette (browser: decode the image). */
  artPalette?: (blob: Blob) => Promise<string[]>;
  hash?: (buf: ArrayBuffer) => Promise<string>;
  now?: () => number;
  /** Downloads sample tracks (default: global fetch). */
  fetch?: (url: string) => Promise<ArrayBuffer>;
}

/** The built-in demo set: synth songs with exact analyses, always ready (fake mode, testing without files). */
export const DEMO_SONGS: Array<[SynthStyle, number]> = [['edm', 1], ['rock', 1], ['ambient', 1], ['edm', 2], ['rock', 2], ['edm', 3]];

export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const d = new Uint8Array(await subtle.digest('SHA-256', buf));
    return [...d.slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // insecure context fallback: FNV-1a over the bytes (fine as a cache key)
  const b = new Uint8Array(buf); let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < b.length; i++) { h1 = Math.imul(h1 ^ b[i], 16777619); h2 = Math.imul(h2 ^ b[b.length - 1 - i], 2246822519); }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0') + b.length.toString(16);
}

const sortKey = (m: SongMeta) => `${(m.artist || '~').toLowerCase()}\u0000${(m.album || '~').toLowerCase()}\u0000${String(m.track ?? 999).padStart(4, '0')}\u0000${m.title.toLowerCase()}`;

/** Fuzzy-ish search: every word must appear in title/artist/album (accents and case ignored). */
export function matchesQuery(m: Pick<SongMeta, 'title' | 'artist' | 'album'>, q: string): boolean {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const hay = norm(`${m.title} ${m.artist} ${m.album ?? ''}`);
  return norm(q).split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

export class MediaLibrary {
  private listeners = new Set<() => void>();
  private queue: string[] = [];
  private busy = false;
  private urls = new Map<string, string>();
  private onlineBlobs = new Map<string, Blob>();
  private onlineLoads = new Map<string, Promise<Blob>>();
  private revisions = new Map<string, number>();
  /** Live analysis progress per song id (0..1 and the stage name). */
  readonly progress = new Map<string, { p: number; stage: string }>();
  private demos: SongMeta[];
  private demoScores = new Map<string, SynthScore>();

  constructor(private o: LibraryOpts) {
    this.demos = DEMO_SONGS.map(([style, seed]) => {
      const s = makeScore(style, seed); this.demoScores.set(s.id, s);
      const a = scoreAnalysis(s);
      return {
        id: s.id, source: 'synth', title: s.title, artist: s.artist, album: 'Wattcade Demo Tracks', durationS: a.durationS,
        palette: synthItem(s).palette, addedAt: 0, status: 'ready', bpm: s.bpm, key: a.key.camelot,
        energy: avg(a.intensity), drops: a.sections.filter((x) => x.kind === 'drop').length,
      } satisfies SongMeta;
    });
  }

  subscribe(cb: () => void): () => void { this.listeners.add(cb); return () => { this.listeners.delete(cb); }; }
  private changed() { for (const l of [...this.listeners]) l(); }

  /** Re-queue anything that was mid-analysis when the app closed. Call once at startup. */
  async resume(): Promise<void> {
    for (const m of await this.o.storage.listMeta()) if (m.status === 'pending' || m.status === 'analyzing') this.enqueue(m.id);
  }

  demoSongs(): SongMeta[] { return this.demos.map((d) => ({ ...d })); }
  async localSongs(): Promise<SongMeta[]> {
    return (await this.o.storage.listMeta()).filter((m) => !m.id.startsWith('sample:')).sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : 0));
  }
  async get(id: string): Promise<SongMeta | undefined> {
    return this.demos.find((d) => d.id === id) ?? this.o.storage.getMeta(id);
  }

  /** Add files: dedupe by content hash, read tags/art, store, then analyse in the background. */
  async importFiles(files: ArrayLike<File>): Promise<SongMeta[]> {
    const out: SongMeta[] = [];
    for (const f of Array.from(files)) {
      const buf = await f.arrayBuffer();
      out.push(await this.addAudio(buf, f.name, f.type, `local:${await (this.o.hash ?? sha256Hex)(buf)}`, { source: 'local' }));
    }
    this.changed();
    return out;
  }

  /** Remember a streaming song without downloading or scheduling full-file analysis. */
  async rememberOnline(song: SongMeta): Promise<SongMeta> {
    if (!['youtube', 'soundcloud'].includes(song.source) || !song.sourceUrl) throw new Error('Invalid online song.');
    const meta = { ...song, status: 'remote' as const, error: undefined, addedAt: (this.o.now ?? Date.now)() };
    await this.o.storage.putMeta(meta); this.changed(); return meta;
  }

  async prepareOnline(song: SongMeta): Promise<SongMeta> {
    if (!['youtube', 'soundcloud'].includes(song.source) || !song.id.startsWith(`${song.source}:`) || !song.sourceUrl || !this.o.loadOnlineAudio) throw new Error('Online audio resolver is not configured.');
    const existing = await this.o.storage.getMeta(song.id);
    if (existing && existing.status !== 'error' && (existing.status !== 'ready' || await this.analysis(song.id))) return existing;
    const m: SongMeta = { ...song, status: 'pending', error: undefined, addedAt: (this.o.now ?? Date.now)() };
    await this.o.storage.putMeta(m); this.enqueue(m.id); this.changed(); return m;
  }

  private async audioBlob(id: string): Promise<Blob | undefined> {
    if (!isOnline(id)) return this.o.storage.getBlob(`audio:${id}`);
    const cached = this.onlineBlobs.get(id); if (cached) return cached;
    const m = await this.o.storage.getMeta(id);
    if (!m || !this.o.loadOnlineAudio) throw new Error('Online song or resolver is missing.');
    const shared = this.onlineLoads.get(id); if (shared) return shared;
    const revision = this.revisions.get(id) ?? 0;
    const load = this.o.loadOnlineAudio(m).then(async (blob) => {
      if ((this.revisions.get(id) ?? 0) !== revision || !await this.o.storage.getMeta(id)) throw new Error('Song was removed.');
      this.onlineBlobs.set(id, blob); return blob;
    }).finally(() => { if (this.onlineLoads.get(id) === load) this.onlineLoads.delete(id); });
    this.onlineLoads.set(id, load); return load;
  }

  private async addAudio(buf: ArrayBuffer, name: string, type: string, id: string, over: Partial<SongMeta>): Promise<SongMeta> {
    const existing = await this.o.storage.getMeta(id);
    if (existing) return existing;
    const tags = readTags(new Uint8Array(buf), name);
    const mime = type || mimeOf(name);
    await this.o.storage.putBlob(`audio:${id}`, new Blob([buf], { type: mime }));
    if (tags.picture) await this.o.storage.putBlob(`art:${id}`, new Blob([tags.picture.data as BlobPart], { type: tags.picture.mime }));
    const m: SongMeta = {
      id, source: 'local', title: tags.title || name, artist: tags.artist || 'Unknown artist', album: tags.album, track: tags.track,
      durationS: 0, addedAt: (this.o.now ?? Date.now)(), status: 'pending', isrc: tags.isrc, fileName: name, mime,
      size: buf.byteLength, hasArt: !!tags.picture, ...over,
    };
    await this.o.storage.putMeta(m);
    this.enqueue(id);
    return m;
  }

  /** The Creative Commons sample set: downloaded ones as stored, the rest as 'remote' placeholders. */
  async sampleSongs(): Promise<SongMeta[]> {
    return Promise.all(SAMPLE_TRACKS.map(async (t) => (await this.o.storage.getMeta(sampleId(t))) ?? {
      id: sampleId(t), source: 'sample', title: t.title, artist: t.artist, album: t.album, genre: t.genre, durationS: 0, addedAt: 0,
      status: 'remote' as const, size: Math.round(t.sizeMb * 1e6), credit: sampleCredit(t),
    }));
  }

  private downloading = new Set<string>();
  /** Fetch a sample track (CORS-open archive.org download) into the library; it is then analysed like a local file. */
  async downloadSample(id: string): Promise<SongMeta | undefined> {
    const t = SAMPLE_TRACKS.find((x) => sampleId(x) === id);
    if (!t) return undefined;
    const have = await this.o.storage.getMeta(id);
    if (have || this.downloading.has(id)) return have;
    this.downloading.add(id); this.progress.set(id, { p: 0, stage: 'downloading' }); this.changed();
    try {
      const get = this.o.fetch ?? (async (url: string) => { const r = await fetch(url); if (!r.ok) throw new Error(`download failed (${r.status})`); return r.arrayBuffer(); });
      const buf = await get(sampleUrl(t));
      const m = await this.addAudio(buf, t.file.split('/').pop()!, 'audio/mpeg', id, {
        source: 'sample', title: t.title, artist: t.artist, album: t.album, genre: t.genre, credit: sampleCredit(t),
      });
      return m;
    } finally { this.downloading.delete(id); this.progress.delete(id); this.changed(); }
  }

  async remove(id: string): Promise<void> {
    if (!id.startsWith('local:') && !id.startsWith('sample:') && !isOnline(id)) return;
    this.queue = this.queue.filter((x) => x !== id);
    this.revisions.set(id, (this.revisions.get(id) ?? 0) + 1);
    this.onlineBlobs.delete(id); this.onlineLoads.delete(id);
    await Promise.all([this.o.storage.delMeta(id), this.o.storage.delAnalysis(id), this.o.storage.delBlob(`audio:${id}`), this.o.storage.delBlob(`art:${id}`)]);
    const u = this.urls.get(id); if (u) { URL.revokeObjectURL(u); this.urls.delete(id); }
    this.changed();
  }

  retry(id: string): void { this.enqueue(id); }

  async analysis(id: string): Promise<SongAnalysis | undefined> {
    const s = this.demoScores.get(id);
    if (s) return scoreAnalysis(s);
    const a = await this.o.storage.getAnalysis(id);
    return a && a.v === ANALYSIS_VERSION ? a : undefined;
  }

  /** Everything the mixer needs for a ready song. */
  async mixItem(id: string): Promise<MixItem | undefined> {
    const s = this.demoScores.get(id);
    if (s) return synthItem(s);
    const [m, a] = await Promise.all([this.o.storage.getMeta(id), this.analysis(id)]);
    if (!m || !a) return undefined;
    return { id, analysis: a, title: m.title, artist: m.artist, palette: m.palette, ...(m.credit ? { credit: m.credit } : {}) };
  }

  /** A playable URL (cached per song until removed). */
  async audioUrl(id: string): Promise<string> {
    const cached = this.urls.get(id); if (cached) return cached;
    let blob: Blob | undefined;
    const s = this.demoScores.get(id);
    if (s) {
      if (!this.o.renderSynth) throw new Error('No synth renderer');
      blob = await this.o.renderSynth(s);
    } else blob = await this.audioBlob(id);
    if (!blob) throw new Error('Song file is missing');
    const sharedUrl = this.urls.get(id); if (sharedUrl) return sharedUrl;
    const u = URL.createObjectURL(blob); this.urls.set(id, u); return u;
  }
  async artUrl(id: string): Promise<string | null> {
    const k = `art:${id}`; const cached = this.urls.get(k); if (cached) return cached;
    const b = await this.o.storage.getBlob(k); if (!b) return null;
    const u = URL.createObjectURL(b); this.urls.set(k, u); return u;
  }

  private enqueue(id: string) {
    if (!this.queue.includes(id)) this.queue.push(id);
    void this.pump();
  }
  /** Wait until the background queue is empty (tests). */
  async idle(): Promise<void> { while (this.busy || this.queue.length) await new Promise((r) => setTimeout(r, 5)); }

  private async pump() {
    if (this.busy) return;
    this.busy = true;
    try {
      while (this.queue.length) {
        const id = this.queue.shift()!;
        const m = await this.o.storage.getMeta(id); if (!m) continue;
        try {
          await this.o.storage.putMeta({ ...m, status: 'analyzing', error: undefined }); this.changed();
          if (isOnline(id) && !this.onlineBlobs.has(id)) { this.progress.set(id, { p: 0, stage: 'extracting' }); this.changed(); }
          const blob = await this.audioBlob(id);
          if (!blob) throw new Error('Song file is missing');
          const a = await this.o.analyze(blob, (p, stage) => { this.progress.set(id, { p, stage }); this.changed(); });
          let palette: string[] = [];
          const art = m.hasArt ? await this.o.storage.getBlob(`art:${id}`) : undefined;
          if (art && this.o.artPalette) palette = await this.o.artPalette(art).catch(() => []);
          if (palette.length < 3) palette = paletteFromKey(a.key.camelot, avg(a.intensity));
          if (!await this.o.storage.getMeta(id)) { this.progress.delete(id); this.changed(); continue; }
          await this.o.storage.putAnalysis(id, a);
          const cur = (await this.o.storage.getMeta(id)) ?? m; // the rider may have removed it meanwhile
          if (await this.o.storage.getMeta(id)) await this.o.storage.putMeta({
            ...cur, status: 'ready', durationS: a.durationS, bpm: a.bpm, key: a.key.camelot, energy: avg(a.intensity),
            drops: a.sections.filter((s) => s.kind === 'drop').length, palette,
          });
        } catch (e) {
          if (await this.o.storage.getMeta(id)) await this.o.storage.putMeta({ ...m, status: 'error', error: e instanceof Error ? e.message : String(e) });
        }
        this.progress.delete(id);
        this.changed();
      }
    } finally { this.busy = false; }
  }
}

const isOnline = (id: string) => id.startsWith('youtube:') || id.startsWith('soundcloud:');
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 1000) / 1000 : 0);
function mimeOf(name: string): string {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  return ({ mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', mp4: 'audio/mp4', flac: 'audio/flac', wav: 'audio/wav', ogg: 'audio/ogg', opus: 'audio/ogg' } as Record<string, string>)[ext] ?? 'audio/*';
}

/** Browser-only helpers for the default library. */
export async function paletteFromImageBlob(blob: Blob): Promise<string[]> {
  const bmp = await createImageBitmap(blob);
  const n = 48;
  const canvas: any = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(n, n) : Object.assign(document.createElement('canvas'), { width: n, height: n });
  const g = canvas.getContext('2d') as CanvasRenderingContext2D;
  g.drawImage(bmp, 0, 0, n, n);
  bmp.close?.();
  return paletteFromPixels(g.getImageData(0, 0, n, n).data, 5);
}
