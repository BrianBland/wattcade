/**
 * The ONLY shell file that imports core / input / progression / devices.
 * Written against the CLAUDE.md "Integration seams"; guessed signatures are
 * isolated behind `any` adapters here so fixes stay local.
 */
import type { GameModule, Profile, SessionRecord, TrainerCommand, ResistanceEffect } from '../contracts';
import { createGameSession, DataHub, SCRIPTS } from '../core';
import { InputHub } from '../input';
import { ProfileStore, SessionStore, awardSession, levelForXp, xpForLevel, ACHIEVEMENTS } from '../progression';
import { FtmsTrainer } from '../devices/ftms';
import { HeartRateMonitor } from '../devices/hr';
import { RideControllerGroup } from '../devices/zwiftRide';
import type { AchievementView, AwardView, DeviceKind, DeviceStatusMap, LevelView, SessionLike } from './types';
import type { DebugActions, DebugSnapshot, TuningEntry } from '../debug/types';

/* eslint-disable @typescript-eslint/no-explicit-any */
const any = <T = any>(x: unknown) => x as T;

export const input = new InputHub();
export const dataHub = new DataHub();
const profileStore: any = new ProfileStore();
const sessionStore: any = new SessionStore();

// ---------- profiles ----------
export const listProfiles = (): Promise<Profile[]> => profileStore.list();
export const saveProfile = async (p: Profile): Promise<void> => { await profileStore.update(p); };
export const deleteProfile = (id: string): Promise<void> => profileStore.delete(id);
export async function createProfile(name: string): Promise<Profile> {
  return profileStore.create(name);
}
export const exportBackup = (): Promise<string> => profileStore.exportJson();
export const importBackup = async (json: string): Promise<void> => { await profileStore.importJson(json); };
export async function lastProfileId(): Promise<string | null> { return (await profileStore.getLastProfileId?.()) ?? null; }
export async function rememberProfile(id: string): Promise<void> { await profileStore.setLastProfileId?.(id); }

// ---------- progression views ----------
export function levelView(xp: number): LevelView {
  const level = levelForXp(xp);
  const lo = xpForLevel(level), hi = xpForLevel(level + 1);
  return { level, xp, nextXp: hi, progress: hi > lo ? Math.min(1, Math.max(0, (xp - lo) / (hi - lo))) : 0 };
}
export function achievementViews(p: Profile): AchievementView[] {
  return any<any[]>(ACHIEVEMENTS).map((a) => ({
    id: a.id, name: a.name ?? a.title ?? a.id, desc: a.desc ?? a.description ?? a.rule ?? '', unlocked: p.achievements.includes(a.id),
  }));
}
const achievementName = (id: string) => achievementViews({ achievements: [] } as any).find((a) => a.id === id)?.name ?? id;

// ---------- devices ----------
let fakeMode = false;
let fakeScript = 'z2';
const status: DeviceStatusMap = { trainer: { connected: false }, controller: { connected: false }, hr: { connected: false } };
const devices: Partial<Record<DeviceKind, any>> = {};
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
export const getFake = () => fakeMode;
export function setFake(on: boolean) { fakeMode = on; notify(); }
export const getDeviceStatus = (): DeviceStatusMap => status;
export function subscribeDevices(cb: () => void): () => void { listeners.add(cb); return () => listeners.delete(cb); }
export let controllerInfo: { firmware?: string; battery?: number; warning?: string } = {};

/** Must be called from a user gesture. */
export async function connectDevice(kind: DeviceKind): Promise<void> {
  if (typeof navigator === 'undefined' || !(navigator as any).bluetooth) {
    status[kind] = { connected: false, error: 'Web Bluetooth unavailable — use Bluefy on iPad or Chrome on desktop (HTTPS or localhost).' }; notify(); return;
  }
  status[kind] = { connected: false, busy: true }; notify();
  try {
    const hub: any = dataHub;
    if (kind === 'trainer') { const d: any = await FtmsTrainer.connect(); devices.trainer = d; hub.attachTrainer(d); d.onStatus?.((s: any) => { status.trainer = { connected: s.connected, detail: s.detail }; notify(); }); }
    else if (kind === 'hr') { const d: any = await HeartRateMonitor.connect(); devices.hr = d; hub.attachHr(d); d.onStatus?.((s: any) => { status.hr = { connected: s.connected }; notify(); }); }
    else {
      // The Ride's two sides may appear as two devices; the group merges them. First tap adds one side.
      const g = new RideControllerGroup();
      g.onStatus((s) => { controllerInfo = { firmware: s.firmware ?? controllerInfo.firmware, battery: s.battery ?? controllerInfo.battery, warning: s.warning ?? controllerInfo.warning }; status.controller = { connected: s.connected, detail: s.warning }; notify(); });
      g.onLog((l) => console.info('[ride]', l));
      await g.addFromPicker();
      devices.controller = g; hub.attachController(g, input);
    }
    status[kind] = { connected: true, detail: status[kind].detail };
  } catch (e) {
    status[kind] = { connected: false, error: e instanceof Error ? e.message : String(e) };
  }
  notify();
}
/** Number of Ride controllers (sides) connected. */
export const controllerCount = (): number => (devices.controller as RideControllerGroup | undefined)?.count ?? 0;

/** Must be called from a user gesture. Connects the other Ride side into the existing group. */
export async function addSecondController(): Promise<void> {
  const g = devices.controller as RideControllerGroup | undefined;
  if (!g) return connectDevice('controller');
  status.controller = { ...status.controller, busy: true, error: undefined }; notify();
  try { await g.addFromPicker(); status.controller = { ...status.controller, busy: false }; }
  catch (e) { status.controller = { ...status.controller, busy: false, error: e instanceof Error ? e.message : String(e) }; }
  notify();
}
export async function disconnectDevice(kind: DeviceKind): Promise<void> {
  await devices[kind]?.disconnect?.(); delete devices[kind]; status[kind] = { connected: false }; notify();
}
const anyReal = () => Object.keys(devices).length > 0;

// ---------- sessions ----------
let active: any = null;
export const activeSession = (): SessionLike | null => active;

export function startSession(game: GameModule, profile: Profile, onSave: (d: unknown) => void): SessionLike {
  input.applySettings(profile.settings); debugState.timeScale = 1;
  const useFake = fakeMode || !anyReal();
  active = createGameSession({
    game, profile, input, dataHub: useFake ? undefined : dataHub,
    fake: useFake ? { script: fakeScript } : false, onSave,
  });
  return active;
}
export async function finishSession(profile: Profile): Promise<{ record: SessionRecord; award: AwardView; profile: Profile }> {
  const record: SessionRecord = active.finish();
  active.mixer?.panic?.(true); active = null;
  await sessionStore.save(record);
  const r: any = awardSession(profile, record);
  const next: Profile = r.profile ?? r['profile\''] ?? profile;
  await saveProfile(next);
  const levelUps: any[] = r.levelUps ?? [];
  const award: AwardView = {
    xpGained: r.xpGained ?? 0,
    levelBefore: profile.level, levelAfter: next.level,
    newAchievements: (r.newAchievements ?? []).map((a: any) => (typeof a === 'string' ? { id: a, name: achievementName(a) } : { id: a.id, name: a.name ?? a.id })),
  };
  void levelUps;
  return { record, award, profile: next };
}

// ---------- trainer test + debug ----------
export function applyTest(cmd: TrainerCommand): void {
  const s: any = active;
  if (s?.mixer) {
    const base = { id: 'trainer-test', priority: 99, ttl: 10 };
    if (cmd.mode === 'none') { s.mixer.clear('trainer-test'); return; }
    const e: ResistanceEffect = cmd.mode === 'sim' ? { ...base, mode: 'sim', gradePct: cmd.gradePct }
      : cmd.mode === 'erg' ? { ...base, mode: 'erg', watts: cmd.watts } : { ...base, mode: 'resistance', levelPct: cmd.levelPct };
    s.mixer.set(e);
  } else void devices.trainer?.apply(cmd);
}

const tuningEntries = (s: any): TuningEntry[] =>
  (s?.tuning?.list?.() ?? []).map((t: any) => ({
    key: t.key, kind: t.kind ?? (typeof t.value === 'boolean' ? 'bool' : t.options ? 'choice' : 'num'),
    value: t.value, def: t.def ?? t.default, min: t.min, max: t.max, step: t.step, options: t.options, help: t.help,
  }));

export function debugSnapshot(): DebugSnapshot {
  const s: any = active;
  const mx = s?.mixer?.debug?.();
  return {
    bike: s ? s.ctx.bike() : null,
    input: s ? s.ctx.input() : input.state(),
    rawController: input.raw(),
    mixer: mx ? { activeEffects: mx.activeEffects ?? [], chosenMode: String(mx.chosenMode ?? ''), lastCommand: mx.lastCommand ?? null, lastResult: mx.lastResult ? (mx.lastResult.ok ? `ok ${mx.lastResult.result ?? ''}` : `FAIL ${mx.lastResult.detail ?? ''}`) : '--' } : null,
    game: s?.debugValues?.() ?? {},
    tuning: tuningEntries(s),
    difficulty: debugState.difficulty, timeScale: debugState.timeScale, fake: s ? !!s.fakeBike : fakeMode,
    fakeScript, scripts: ['manual', ...Object.keys(any(SCRIPTS))],
    stats: { trainer: devices.trainer?.stats?.(), hr: devices.hr?.stats?.(), controller: devices.controller?.stats?.() },
    controllerInfo,
  };
}
const debugState = { difficulty: 1, timeScale: 1 };
export const debugActions: DebugActions = {
  setDifficulty(v) { debugState.difficulty = v; any(active)?.mixer?.setDifficulty(v); },
  setTimeScale(v) { debugState.timeScale = v; if (active?.loop) active.loop.timeScale = v; if (active?.ctx) active.ctx.clock.timeScale = v; },
  panic(on) { any(active)?.mixer?.panic(on); },
  applyTest,
  setTuning(k, v) { any(active)?.tuning?.set(k, v); },
  resetTuning() { any(active)?.tuning?.reset(); },
  setFakeScript(n) { fakeScript = n; any(active)?.fakeBike?.useScript(n === 'manual' ? null : n); },
  fakeAdjust(k, d) {
    const fb = any(active)?.fakeBike; if (!fb) return;
    if (fb.script) {   // switch to manual control, seeded from current values so nothing jumps
      const r = any(active).ctx.bike().raw; fb.useScript(null);
      fb.manual.cadence = r.cadence; fb.manual.power = r.power; fb.manual.hr = r.hr;
    }
    const m = fb.manual;
    if (k === 'cadence') m.cadence = Math.max(0, m.cadence + d);
    else if (k === 'power') m.power = Math.max(0, (m.power ?? 150) + d);
    else m.hr = Math.max(40, (m.hr ?? 100) + d);
  },
};
/** Shifter hooks while the debug overlay is open (difficulty / timeScale). */
export function bindDebugInput(): () => void {
  const hub: any = input;
  hub.onDebugAdjust?.((k: 'difficulty' | 'timeScale', d: number) => {
    if (k === 'difficulty') debugActions.setDifficulty(Math.min(1.5, Math.max(0.5, +(debugState.difficulty + d).toFixed(2))));
    else if (fakeMode || !anyReal()) debugActions.setTimeScale(Math.min(100, Math.max(1, debugState.timeScale + d)));
  });
  return input.onSystem((a) => { for (const f of systemListeners) f(a); });
}
const systemListeners = new Set<(a: 'pause' | 'toggleDebug' | 'panic') => void>();
export function onSystem(cb: (a: 'pause' | 'toggleDebug' | 'panic') => void): () => void { systemListeners.add(cb); return () => systemListeners.delete(cb); }
export const setDebugOpen = (open: boolean) => { any(input).debugOpen = open; };
