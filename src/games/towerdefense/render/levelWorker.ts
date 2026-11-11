/// <reference lib="webworker" />
// Level worker: runs single generator attempts off the main thread for the parallel level pool.
import { planLevel, runAttempt, type Generated } from '../sim/generator';
import type { MapSpec } from './levelPool';

export interface LevelWorkerRequest { id: number; spec: MapSpec; attempt: number }
export interface LevelWorkerReply { id: number; outcome: { result: Generated; passed: boolean } | null; error?: string }

self.onmessage = (e: MessageEvent<LevelWorkerRequest>) => {
  const { id, spec, attempt } = e.data;
  const opts = { style: spec.roadStyle, ground: spec.ground, pads: spec.pads };
  let reply: LevelWorkerReply;
  try { reply = { id, outcome: runAttempt(planLevel(spec.seed, opts), attempt, opts) }; }
  catch (err) { reply = { id, outcome: null, error: String(err) }; }
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(reply);
};
