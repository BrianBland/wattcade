import type { Tuning } from '../contracts';

export type TuningValue = number | boolean | string;
export interface TuningEntry {
  key: string; ns: string; name: string;
  kind: 'num' | 'bool' | 'choice';
  value: TuningValue; def: TuningValue;
  min?: number; max?: number; step?: number; options?: readonly string[]; help?: string;
}
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function detectStorage(): StorageLike | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch { /* blocked */ }
  return null;
}

/** Namespaced, runtime-overridable tunables. Persisted per profile+namespace in localStorage (no-op in Node). */
export class TuningRegistry {
  private entries = new Map<string, TuningEntry>();
  private storage: StorageLike | null;
  private profileId: string;
  private loaded = new Map<string, Record<string, TuningValue>>();
  private listeners = new Set<() => void>();

  constructor(opts: { profileId?: string; storage?: StorageLike | null } = {}) {
    this.profileId = opts.profileId ?? 'default';
    this.storage = opts.storage === undefined ? detectStorage() : opts.storage;
  }

  scoped(ns: string): Tuning {
    const reg = this;
    const full = (k: string) => `${ns}.${k}`;
    return {
      num: (key, def, min, max, step, help) =>
        reg.register({ key: full(key), ns, name: key, kind: 'num', value: def, def, min, max, step, help }),
      bool: (key, def, help) =>
        reg.register({ key: full(key), ns, name: key, kind: 'bool', value: def, def, help }),
      choice: <T extends string>(key: string, def: T, options: readonly T[], help?: string) =>
        reg.register({ key: full(key), ns, name: key, kind: 'choice', value: def, def, options, help }) as () => T,
    } as Tuning;
  }

  private register(e: TuningEntry): () => any {
    let entry = this.entries.get(e.key);
    if (!entry) {
      entry = e;
      const saved = this.savedFor(e.ns)[e.key];
      if (saved !== undefined) entry.value = this.coerce(entry, saved) ?? entry.value;
      this.entries.set(e.key, entry);
    }
    const ref = entry;
    return () => ref.value;
  }

  list(ns?: string): TuningEntry[] {
    return [...this.entries.values()].filter((e) => !ns || e.ns === ns);
  }
  get(key: string): TuningValue | undefined { return this.entries.get(key)?.value; }

  set(key: string, v: TuningValue): boolean {
    const e = this.entries.get(key);
    if (!e) return false;
    const c = this.coerce(e, v);
    if (c === undefined) return false;
    e.value = c;
    this.persist(e.ns);
    this.listeners.forEach((l) => l());
    return true;
  }

  reset(ns?: string): void {
    const nss = new Set<string>();
    for (const e of this.entries.values()) {
      if (ns && e.ns !== ns) continue;
      e.value = e.def; nss.add(e.ns);
    }
    for (const n of nss) { this.loaded.set(n, {}); this.persist(n); }
    this.listeners.forEach((l) => l());
  }

  onChange(cb: () => void): () => void { this.listeners.add(cb); return () => this.listeners.delete(cb); }

  private coerce(e: TuningEntry, v: unknown): TuningValue | undefined {
    if (e.kind === 'num') {
      const n = typeof v === 'number' ? v : Number(v);
      if (!Number.isFinite(n)) return undefined;
      return Math.min(e.max!, Math.max(e.min!, n));
    }
    if (e.kind === 'bool') return typeof v === 'boolean' ? v : v === 'true' ? true : v === 'false' ? false : undefined;
    return typeof v === 'string' && e.options!.includes(v) ? v : undefined;
  }

  private skey(ns: string) { return `wattcade.tuning.${this.profileId}.${ns}`; }
  private savedFor(ns: string): Record<string, TuningValue> {
    const have = this.loaded.get(ns);
    if (have) return have;
    let m: Record<string, TuningValue> = {};
    try { const raw = this.storage?.getItem(this.skey(ns)); if (raw) m = JSON.parse(raw); } catch { /* ignore */ }
    this.loaded.set(ns, m);
    return m;
  }
  private persist(ns: string): void {
    const m: Record<string, TuningValue> = {};
    for (const e of this.entries.values()) if (e.ns === ns && e.value !== e.def) m[e.key] = e.value;
    this.loaded.set(ns, m);
    try {
      if (Object.keys(m).length) this.storage?.setItem(this.skey(ns), JSON.stringify(m));
      else this.storage?.removeItem(this.skey(ns));
    } catch { /* ignore */ }
  }
}
