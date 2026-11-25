// Pure live-update logic: the feed, what changed between versions, and what applying a version does to a running game.
import { FEED_MAX, type LiveFeed, type LiveGameEntry, type LiveVersion, type TuneDefault } from './types';

/** The three layers of a game that can sit at different versions. null = the app's own built-in copy. */
export interface Layers { sim: string | null; render: string | null; tuning: string | null }
export const BUILT_IN: Layers = { sim: null, render: null, tuning: null };
export type Kind = 'tuning' | 'art' | 'logic' | 'shell';
export const KIND_ORDER: Kind[] = ['tuning', 'art', 'logic', 'shell'];

export function appendToFeed(prev: LiveFeed, v: LiveVersion): LiveFeed {
  const versions = [...(prev.versions ?? []).filter((x) => x.sha !== v.sha), v];
  return { versions: versions.slice(-FEED_MAX) };
}

/** Stable short hash of a tunables map (FNV-1a, two lanes) so the feed can say whether defaults changed. */
export function tuningHash(t: Record<string, TuneDefault>): string {
  const s = JSON.stringify(Object.keys(t).sort().map((k) => [k, t[k].d, t[k].min ?? null, t[k].max ?? null]));
  let a = 0x811c9dc5, b = 0x01000193 ^ s.length;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 0x01000193); b = Math.imul(b ^ c, 0x5bd1e995) ^ (b >>> 15); }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}

export const findVersion = (feed: LiveFeed | null, sha: string | null): LiveVersion | null =>
  (sha && feed?.versions.find((v) => v.sha === sha)) || null;

/** A layer's entry: a pinned version's, or the built-in copy's (the feed entry for the app's own build, if listed). */
function entryFor(feed: LiveFeed, gameId: string, sha: string | null, builtInSha: string | null): LiveGameEntry | null {
  return findVersion(feed, sha ?? builtInSha)?.games[gameId] ?? null;
}

/** Which kinds of change separate `from` and `to` for one game (null entries = unknown: assume everything changed). */
export function kindsBetween(gameId: string, from: LiveVersion | null, to: LiveVersion): Set<Kind> {
  const k = new Set<Kind>();
  const a = from?.games[gameId], b = to.games[gameId];
  if (!b) return k;
  if (!a) { k.add('logic'); k.add('art'); k.add('tuning'); return k; }
  if (a.sim !== b.sim) k.add('logic');
  if (a.render !== b.render) k.add('art');
  if (a.tuning !== b.tuning) k.add('tuning');
  if (from && from.shell !== to.shell) k.add('shell');
  return k;
}

/** Feed versions (oldest first) with what each changed for `gameId` against the version before it; versions that didn't touch the game are left out. */
export function gameHistory(feed: LiveFeed, gameId: string): Array<{ v: LiveVersion; kinds: Set<Kind> }> {
  const out: Array<{ v: LiveVersion; kinds: Set<Kind> }> = [];
  let prev: LiveVersion | null = null;
  for (const v of feed.versions) {
    if (!v.games[gameId]) { prev = v; continue; }
    const kinds = prev?.games[gameId] ? kindsBetween(gameId, prev, v) : new Set<Kind>(); // the first one: nothing to compare
    kinds.delete('shell'); // shell changes are listed once, app-wide
    if (!prev?.games[gameId] || kinds.size) out.push({ v, kinds });
    prev = v;
  }
  return out;
}

/** What the running game's layers are at, as feed entries. */
export function runningEntries(feed: LiveFeed, gameId: string, running: Layers, builtInSha: string | null) {
  return {
    sim: entryFor(feed, gameId, running.sim, builtInSha),
    render: entryFor(feed, gameId, running.render, builtInSha),
    tuning: entryFor(feed, gameId, running.tuning, builtInSha),
  };
}

export interface ApplyPlan {
  /** Layers to pin after applying. */
  next: Layers;
  /** Swap now, mid-ride. */
  tuningNow: boolean; renderNow: boolean;
  /** The sim moves: takes effect the next time the game starts. */
  simNextStart: boolean;
  /** The renderer can't move mid-ride: the running sim's snapshots are a different format. */
  renderWaitsForSim: boolean;
}

/**
 * Plan moving a game from its pinned layers to version `to` (null = the built-in copy). `liveSim` is the sim layer
 * actually running (pins.sim may already point at a queued logic change). With `skipLogic` the sim pin stays put and
 * only the tunables and (when it can draw the running sim's snapshots) the renderer move.
 */
export function planApply(feed: LiveFeed, gameId: string, pins: Layers, builtInSha: string | null, to: LiveVersion | null,
  opts: { skipLogic?: boolean; liveSim?: string | null; builtInSnapshot?: number } = {}): ApplyPlan {
  const toSha = to?.sha ?? null;
  const target = to ? to.games[gameId] ?? null : entryFor(feed, gameId, null, builtInSha);
  const cur = runningEntries(feed, gameId, pins, builtInSha);
  const next: Layers = { ...pins };
  const plan: ApplyPlan = { next, tuningNow: false, renderNow: false, simNextStart: false, renderWaitsForSim: false };
  if (to && !target) return plan;
  const differs = (layer: keyof Layers, field: 'sim' | 'render' | 'tuning') =>
    pins[layer] !== toSha && (!cur[layer] || !target || cur[layer]![field] !== target[field]);
  if (!opts.skipLogic && differs('sim', 'sim')) { next.sim = toSha; plan.simNextStart = true; }
  if (differs('tuning', 'tuning')) { next.tuning = toSha; plan.tuningNow = true; }
  if (differs('render', 'render')) {
    const live = opts.liveSim === undefined ? pins.sim : opts.liveSim;
    const format = (sha: string | null) => sha === null && !findVersion(feed, builtInSha) ? (opts.builtInSnapshot ?? 1) : entryFor(feed, gameId, sha, builtInSha)?.snapshot ?? 1;
    const targetFormat = target?.snapshot ?? opts.builtInSnapshot ?? 1;
    if (targetFormat === format(live)) { next.render = toSha; plan.renderNow = true; }
    else { plan.renderWaitsForSim = true; if (targetFormat === format(next.sim)) next.render = toSha; }
  }
  return plan;
}

/** Newer versions this game hasn't taken yet (newest first), honouring a skipped sim hash. */
export function pendingFor(feed: LiveFeed, gameId: string, running: Layers, builtInSha: string | null, skippedSim: string | null) {
  const cur = runningEntries(feed, gameId, running, builtInSha);
  const latest = [...feed.versions].reverse().find((v) => v.games[gameId]);
  if (!latest) return [];
  const t = latest.games[gameId];
  const behind = (!cur.render || cur.render.render !== t.render) || (!cur.tuning || cur.tuning.tuning !== t.tuning)
    || ((!cur.sim || cur.sim.sim !== t.sim) && t.sim !== skippedSim);
  if (!behind) return [];
  // the versions after the newest one already running in any layer
  const shas = [running.sim, running.render, running.tuning, builtInSha];
  let from = -1;
  feed.versions.forEach((v, i) => { if (shas.includes(v.sha)) from = Math.max(from, i); });
  return gameHistory({ versions: feed.versions.slice(Math.max(0, from)) }, gameId).filter((h) => feed.versions.indexOf(h.v) > from).reverse();
}

/** Shell (app-wide) versions newer than the app's own build: they need a reload. */
export function shellPending(feed: LiveFeed, builtInSha: string | null): LiveVersion[] {
  const self = findVersion(feed, builtInSha);
  if (!self) return [];
  const latest = feed.versions[feed.versions.length - 1];
  return latest && latest.shell !== self.shell ? [latest] : [];
}

export function ago(ms: number, now: number): string {
  const s = Math.max(0, (now - ms) / 1000);
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}
