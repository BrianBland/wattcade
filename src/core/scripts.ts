import { hash01 } from './rng';
import type { TimelineEvent } from './inputs';

export interface ScriptEnv { hooks?: Record<string, unknown>; seed: number }
/** A fake-rider script. Power is expressed as an FTP fraction; undefined => let the trainer model decide. */
export interface Script {
  name: string; description: string;
  usesHooks?: boolean;               // sim.snapshot().hooks is read each tick when true
  cadence(t: number, env?: ScriptEnv): number;
  powerFtp?(t: number, env: ScriptEnv): number | undefined;
  input?: TimelineEvent[];           // paired scripted input
}

const cad = (t: number) => 90 + 5 * Math.sin(t / 7);   // 85..95
const mk = (name: string, description: string, powerFtp: Script['powerFtp'], extra: Partial<Script> = {}): Script =>
  ({ name, description, cadence: cad, powerFtp, ...extra });

export const SCRIPTS: Record<string, Script> = {
  idle: { name: 'idle', description: '0 W, 0 rpm', cadence: () => 0, powerFtp: () => 0 },
  z2: mk('z2', '0.65 FTP steady', () => 0.65),
  'z2-drift': mk('z2-drift', 'wanders 0.5..0.8 FTP', (t) => 0.65 + 0.15 * Math.sin((2 * Math.PI * t) / 300)),
  sprints: mk('sprints', '0.6 FTP, 15 s at 1.5 FTP every 2 min', (t) => (t % 120 >= 105 ? 1.5 : 0.6)),
  intervals: mk('intervals', '4 x (3 min 1.05 FTP, 2 min 0.55)', (t) => (t >= 1200 ? 0.55 : t % 300 < 180 ? 1.05 : 0.55)),
  'storm-ready': mk('storm-ready', '0.65 FTP; 0.95 FTP while hooks.storm is set',
    (_t, e) => (e.hooks && (e.hooks as any).storm ? 0.95 : 0.65), { usesHooks: true }),
  /** Cadence-led scripts for ERG games (power is the trainer's job in ERG; these only differ in rpm). */
  grind: mk('grind', '0.7 FTP at 62..68 rpm', () => 0.7, { cadence: (t) => 65 + 3 * Math.sin(t / 5) }),
  spin: mk('spin', '0.7 FTP at 102..108 rpm', () => 0.7, { cadence: (t) => 105 + 3 * Math.sin(t / 5) }),
  'cadence-follow': mk('cadence-follow', '0.65 FTP; rpm follows hooks.cadence (default 90)', () => 0.65, {
    usesHooks: true,
    cadence: (t, e) => {
      const want = Number((e?.hooks as { cadence?: number } | undefined)?.cadence ?? 90);
      return want + 2 * Math.sin(t / 5);
    },
  }),
  mash: mk('mash', 'random 0.4..1.6 FTP, changes every 2 s', (t, e) => 0.4 + 1.2 * hash01(Math.floor(t / 2) + e.seed * 7919)),
};
