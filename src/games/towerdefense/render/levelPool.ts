import { MAX_ATTEMPTS, pickAttempt, planLevel, type Generated } from '../sim/generator';
import type { LevelSpec } from '../sim/campaign';
import { specKey } from '../sim/baked';
import { knownLevel, primeLevel } from '../sim/levelCache';
import type { LevelWorkerReply, LevelWorkerRequest } from './levelWorker';

export type MapSpec = Pick<LevelSpec, 'seed' | 'roadStyle' | 'ground' | 'pads'>;
type Outcome = { result: Generated; passed: boolean } | null;
/** Runs one attempt of `spec` somewhere (a worker, or inline in tests). */
export type AttemptRunner = (spec: MapSpec, attempt: number) => Promise<Outcome>;

/**
 * Generate `spec` with its attempts spread over `slots` concurrent runners, giving exactly `generateLevel`'s map:
 * attempts are dispatched in order, and the answer is settled only once every earlier attempt is known (the first
 * that passes the bar, else the best fallback in attempt order). Attempts after a settled answer are not started.
 */
export function generateParallel(spec: MapSpec, run: AttemptRunner, slots: number): Promise<Generated> {
  const plan = planLevel(spec.seed, { style: spec.roadStyle, ground: spec.ground, pads: spec.pads });
  const outcomes: Array<Outcome | undefined> = new Array(MAX_ATTEMPTS).fill(undefined);
  return new Promise<Generated>((resolve, reject) => {
    let next = 1, done = false;
    const settle = () => {
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        const o = outcomes[i];
        if (o === undefined) return false;
        if (o?.passed) break;
      }
      done = true;
      try { resolve(pickAttempt(plan, outcomes.filter((o): o is Outcome => o !== undefined))); } catch (e) { reject(e); }
      return true;
    };
    const launch = () => {
      if (done || next > MAX_ATTEMPTS) return;
      const attempt = next++;
      run(spec, attempt).then(o => {
        if (done) return;
        outcomes[attempt - 1] = o;
        if (!settle()) launch();
      }, e => { if (!done) { done = true; reject(e); } });
    };
    for (let i = 0; i < Math.max(1, slots); i++) launch();
  });
}

// ---------- browser pool ----------
let workers: Array<{ w: Worker; busy: boolean }> | null = null;
const queue: Array<{ req: Omit<LevelWorkerRequest, 'id'>; resolve: (o: Outcome) => void; reject: (e: Error) => void }> = [];
const waiting = new Map<number, { resolve: (o: Outcome) => void; reject: (e: Error) => void; slot: { w: Worker; busy: boolean } }>();
let nextId = 1;

/** Workers to use: leave a core for the main thread, at most 4 (the slow maps need about 11 attempts). */
export const poolSize = () => Math.max(1, Math.min(4, (globalThis.navigator?.hardwareConcurrency ?? 2) - 1));

function pool() {
  if (workers || typeof Worker === 'undefined') return workers;
  workers = Array.from({ length: poolSize() }, () => {
    const slot = { w: new Worker(new URL('./levelWorker.ts', import.meta.url), { type: 'module' }), busy: false };
    slot.w.onmessage = (e: MessageEvent<LevelWorkerReply>) => {
      const p = waiting.get(e.data.id); if (!p) return;
      waiting.delete(e.data.id); slot.busy = false;
      if (e.data.error) p.reject(new Error(e.data.error)); else p.resolve(e.data.outcome);
      pump();
    };
    slot.w.onerror = (e) => {
      for (const [id, p] of waiting) if (p.slot === slot) { waiting.delete(id); p.reject(new Error(e.message || 'level worker failed')); }
      slot.busy = false; pump();
    };
    return slot;
  });
  return workers;
}
function pump() {
  for (const slot of workers ?? []) {
    if (slot.busy || !queue.length) continue;
    const job = queue.shift()!, id = nextId++;
    slot.busy = true; waiting.set(id, { resolve: job.resolve, reject: job.reject, slot });
    slot.w.postMessage({ ...job.req, id } satisfies LevelWorkerRequest);
  }
}
const workerRunner: AttemptRunner = (spec, attempt) => new Promise((resolve, reject) => { queue.push({ req: { spec, attempt }, resolve, reject }); pump(); });

const inFlight = new Map<string, Promise<void>>();
/**
 * Build `spec`'s map in the background and prime the shared cache, so starting it later is instant. A no-op when the
 * map is already known, already building, or workers don't exist (the sim then generates it when asked, as before).
 */
export function prefetchLevel(spec: MapSpec): Promise<void> | null {
  const key = specKey(spec);
  if (knownLevel(spec)) return null;
  const busy = inFlight.get(key); if (busy) return busy;
  const ws = pool(); if (!ws) return null;
  const p = generateParallel(spec, workerRunner, ws.length)
    .then(g => primeLevel(spec, g.level), e => console.warn('level prefetch failed', e))
    .finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}
