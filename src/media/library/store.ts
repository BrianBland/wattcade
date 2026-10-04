import { createStore, del, get, set, values, type UseStore } from 'idb-keyval';
import type { SongAnalysis, SongRef } from '../types';

/** A song in the rider's library (local files) or the built-in demo set. */
export interface SongMeta extends SongRef {
  addedAt: number;
  status: 'pending' | 'analyzing' | 'ready' | 'error';
  error?: string;
  bpm?: number; key?: string; energy?: number; drops?: number;
  isrc?: string; fileName?: string; mime?: string; size?: number; hasArt?: boolean;
}

/** Where the library keeps things. IndexedDB in the browser, memory in tests. */
export interface MediaStorage {
  listMeta(): Promise<SongMeta[]>;
  getMeta(id: string): Promise<SongMeta | undefined>;
  putMeta(m: SongMeta): Promise<void>;
  delMeta(id: string): Promise<void>;
  getAnalysis(id: string): Promise<SongAnalysis | undefined>;
  putAnalysis(id: string, a: SongAnalysis): Promise<void>;
  delAnalysis(id: string): Promise<void>;
  /** Audio files ('audio:<id>') and cover art ('art:<id>'). */
  getBlob(key: string): Promise<Blob | undefined>;
  putBlob(key: string, b: Blob): Promise<void>;
  delBlob(key: string): Promise<void>;
}

/** IndexedDB (idb-keyval), one database per kind so listing metadata never loads audio. */
export class IdbStorage implements MediaStorage {
  private meta: UseStore; private analysis: UseStore; private blobs: UseStore;
  constructor(prefix = 'wattcade-media') {
    this.meta = createStore(`${prefix}-meta`, 'meta');
    this.analysis = createStore(`${prefix}-analysis`, 'analysis');
    this.blobs = createStore(`${prefix}-blobs`, 'blobs');
    // ask the browser not to evict the library under storage pressure (best effort)
    void (globalThis.navigator as any)?.storage?.persist?.().catch?.(() => {});
  }
  listMeta = () => values<SongMeta>(this.meta);
  getMeta = (id: string) => get<SongMeta>(id, this.meta);
  putMeta = (m: SongMeta) => set(m.id, m, this.meta);
  delMeta = (id: string) => del(id, this.meta);
  getAnalysis = (id: string) => get<SongAnalysis>(id, this.analysis);
  putAnalysis = (id: string, a: SongAnalysis) => set(id, a, this.analysis);
  delAnalysis = (id: string) => del(id, this.analysis);
  getBlob = (k: string) => get<Blob>(k, this.blobs);
  putBlob = (k: string, b: Blob) => set(k, b, this.blobs);
  delBlob = (k: string) => del(k, this.blobs);
}

export class MemoryStorage implements MediaStorage {
  private m = new Map<string, SongMeta>(); private a = new Map<string, SongAnalysis>(); private b = new Map<string, Blob>();
  listMeta = async () => [...this.m.values()].map((x) => ({ ...x }));
  getMeta = async (id: string) => { const x = this.m.get(id); return x && { ...x }; };
  putMeta = async (x: SongMeta) => { this.m.set(x.id, { ...x }); };
  delMeta = async (id: string) => { this.m.delete(id); };
  getAnalysis = async (id: string) => this.a.get(id);
  putAnalysis = async (id: string, x: SongAnalysis) => { this.a.set(id, x); };
  delAnalysis = async (id: string) => { this.a.delete(id); };
  getBlob = async (k: string) => this.b.get(k);
  putBlob = async (k: string, x: Blob) => { this.b.set(k, x); };
  delBlob = async (k: string) => { this.b.delete(k); };
}
