// Browser side of live updates: poll the feed, fetch version manifests, import a version's game module, and
// resolve which code a game starts with. Off unless the rider turns on Settings → Live updates.
import type { GameModule, Profile } from '../contracts';
import { findVersion, type Layers } from './feed';
import { LiveStore } from './store';
import type { LiveFeed, LiveManifest, LiveVersion, TuneDefault } from './types';

export const FEED_URL: string = import.meta.env?.VITE_LIVE_FEED || 'https://live-wattcade.brian-t-bland.workers.dev/live/feed.json';
/** The commit the running app was built from (deploys set it); null in dev. */
export const BUILD_SHA: string | null = import.meta.env?.VITE_BUILD_SHA || null;
const POLL_MS = 20_000;

type Listener = () => void;

class LiveClient {
  feed: LiveFeed | null = null;
  error = '';
  private enabled = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<Listener>();
  private manifests = new Map<string, Promise<LiveManifest>>();
  private modules = new Map<string, Promise<GameModule>>();
  private inflight: Promise<LiveFeed | null> | null = null;

  isEnabled() { return this.enabled; }
  /** Follow the profile's setting: start or stop polling. */
  setEnabled(on: boolean) {
    if (on === this.enabled) return;
    this.enabled = on;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (on) { void this.poll(); this.timer = setInterval(() => { if (typeof document === 'undefined' || !document.hidden) void this.poll(); }, POLL_MS); }
    this.emit();
  }
  subscribe(cb: Listener): () => void { this.listeners.add(cb); return () => this.listeners.delete(cb); }
  private emit() { this.listeners.forEach((l) => l()); }

  poll(): Promise<LiveFeed | null> {
    if (this.inflight) return this.inflight;
    this.inflight = (async () => {
      try {
        const r = await fetch(FEED_URL, { cache: 'no-store' });
        if (!r.ok) throw new Error(`feed ${r.status}`);
        const feed = await r.json() as LiveFeed;
        const changed = JSON.stringify(feed.versions.map((v) => v.sha)) !== JSON.stringify(this.feed?.versions.map((v) => v.sha));
        this.feed = feed; this.error = '';
        if (changed) this.emit();
      } catch (e) { const msg = e instanceof Error ? e.message : String(e); if (msg !== this.error) { this.error = msg; this.emit(); } }
      finally { this.inflight = null; }
      return this.feed;
    })();
    return this.inflight;
  }

  /** The feed, fetching it first if there isn't one yet (gives up after `ms`). */
  async ready(ms = 4000): Promise<LiveFeed | null> {
    if (this.feed) return this.feed;
    return Promise.race([this.poll(), new Promise<null>((r) => setTimeout(() => r(null), ms))]);
  }

  manifest(v: LiveVersion): Promise<LiveManifest> {
    let p = this.manifests.get(v.sha);
    if (!p) {
      p = fetch(`${v.base}live/manifest.json`).then((r) => { if (!r.ok) throw new Error(`manifest ${r.status}`); return r.json() as Promise<LiveManifest>; });
      p.catch(() => this.manifests.delete(v.sha));
      this.manifests.set(v.sha, p);
    }
    return p;
  }
  async tuning(v: LiveVersion, gameId: string): Promise<Record<string, TuneDefault>> { return (await this.manifest(v)).tuning[gameId] ?? {}; }

  /** A version's copy of a game (its sim and its renderer). */
  module(v: LiveVersion, gameId: string): Promise<GameModule> {
    const key = `${v.sha}:${gameId}`;
    let p = this.modules.get(key);
    if (!p) {
      const entry = v.games[gameId]?.entry;
      if (!entry) return Promise.reject(new Error(`${gameId} isn't in ${v.short}`));
      installWorkerShim();
      p = import(/* @vite-ignore */ `${v.base}${entry}`).then((m: { module?: GameModule }) => {
        if (!m.module || m.module.id !== gameId) throw new Error(`${v.short} has no ${gameId} module`);
        return m.module;
      });
      p.catch(() => this.modules.delete(key));
      this.modules.set(key, p);
    }
    return p;
  }
}

export const live = new LiveClient();

export interface LiveRun {
  /** Layers the game starts with (missing versions fall back to built-in). */
  layers: Layers;
  sim: GameModule; render: GameModule;
  tuning: Record<string, TuneDefault> | null;
  notes: string[];
}

/** Resolve the code a game starts with from its pins (null when live updates are off or nothing is pinned). */
export async function resolveLiveRun(game: GameModule, profile: Profile): Promise<LiveRun | null> {
  if (!live.isEnabled()) return null;
  const pins = new LiveStore(profile.id).game(game.id).pins;
  if (!pins.sim && !pins.render && !pins.tuning) return null;
  const feed = await live.ready();
  const notes: string[] = [];
  const layers: Layers = { sim: null, render: null, tuning: null };
  const load = async (sha: string | null, what: string): Promise<GameModule | null> => {
    if (!sha) return null;
    const v = findVersion(feed, sha);
    if (!v) { notes.push(`${what} ${sha.slice(0, 7)} isn't in the feed any more: using the built-in one`); return null; }
    try { return await live.module(v, game.id); } catch (e) { notes.push(`${what} ${v.short} didn't load (${e instanceof Error ? e.message : e}): using the built-in one`); return null; }
  };
  const simMod = await load(pins.sim, 'Logic');
  if (simMod) layers.sim = pins.sim;
  let renderMod = await load(pins.render, 'Art');
  if (renderMod) layers.render = pins.render;
  const fmt = (m: GameModule) => m.snapshotFormat ?? 1;
  if (fmt(renderMod ?? game) !== fmt(simMod ?? game)) {
    notes.push('Art and logic versions draw different snapshots: using the art that matches the logic');
    renderMod = simMod; layers.render = layers.sim;
  }
  let tuning: Record<string, TuneDefault> | null = null;
  const tv = findVersion(feed, pins.tuning);
  if (tv) { try { tuning = await live.tuning(tv, game.id); layers.tuning = tv.sha; } catch { notes.push(`Tuning ${tv.short} didn't load: using built-in values`); } }
  const sim = simMod ? { ...game, createSim: simMod.createSim.bind(simMod), snapshotFormat: simMod.snapshotFormat } : game;
  const render = renderMod ?? game;
  return { layers, sim: { ...sim, loadRenderer: () => render.loadRenderer() }, render, tuning, notes };
}

let shimmed = false;
/** Module workers must be same-origin; a version's renderer that starts one gets a same-origin blob that imports it. */
function installWorkerShim() {
  if (shimmed || typeof window === 'undefined' || typeof Worker === 'undefined') return;
  shimmed = true;
  const Native = window.Worker;
  class LiveWorker extends Native {
    constructor(url: string | URL, opts?: WorkerOptions) {
      const abs = new URL(String(url), location.href);
      if (abs.origin === location.origin || abs.protocol === 'blob:' || abs.protocol === 'data:') { super(url, opts); return; }
      const src = opts?.type === 'module' ? `import ${JSON.stringify(abs.href)};` : `importScripts(${JSON.stringify(abs.href)});`;
      super(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })), opts);
    }
  }
  window.Worker = LiveWorker as typeof Worker;
}
