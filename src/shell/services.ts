/**
 * The ONLY shell file that imports core / input / progression / devices.
 * Written against the CLAUDE.md "Integration seams"; guessed signatures are
 * isolated behind `any` adapters here so fixes stay local.
 */
import type { Button, GameModule, InputState, Profile, Seconds, SessionRecord, TrainerCommand, ResistanceEffect } from '../contracts';
import { createGameSession, DataHub, SCRIPTS } from '../core';
import { InputHub } from '../input';
import { ProfileStore, SessionStore, awardSession, defaultProfile, levelForXp, xpForLevel, ACHIEVEMENTS } from '../progression';
import { lobbyGame } from '../games/registry';
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
    if (kind === 'trainer') { const d: any = await FtmsTrainer.connect((step) => { status.trainer = { connected: false, busy: true, detail: step }; notify(); }); devices.trainer = d; hub.attachTrainer(d); d.onStatus?.((s: any) => { status.trainer = { connected: s.connected, detail: s.detail }; notify(); }); }
    else if (kind === 'hr') { const d: any = await HeartRateMonitor.connect((step: string) => { status.hr = { connected: false, busy: true, detail: step }; notify(); }); devices.hr = d; hub.attachHr(d); d.onStatus?.((s: any) => { status.hr = { connected: s.connected }; notify(); }); }
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
let activeGameId = '';
export const activeSession = (): SessionLike | null => active;
/** The game session if one is running, else the warm-up lobby (for debug + fake keys). */
const current = (): any => active ?? lobby;

export function startSession(game: GameModule, profile: Profile, onSave: (d: unknown) => void): SessionLike {
  input.applySettings(profile.settings); debugState.timeScale = 1;
  const useFake = fakeMode || !anyReal();
  activeGameId = game.id;
  active = createGameSession({
    game, profile, input, dataHub: useFake ? undefined : dataHub,
    fake: useFake ? { script: fakeScript } : false, onSave,
  });
  return active;
}
export async function finishSession(profile: Profile): Promise<{ record: SessionRecord; award: AwardView; profile: Profile }> {
  const record: SessionRecord = active.finish();
  active.mixer?.panic?.(true); active = null;
  return creditRecord(profile, record);
}
/** Drop the running game session without saving (left from its intro, before riding). */
export function abandonSession(): void {
  if (!active) return;
  active.finish(); active.mixer?.panic?.(true); active = null;
}
/** What the rider would earn if the game ended now (for mid-ride toasts). Nothing is saved. */
export function previewAward(profile: Profile): { xp: number; level: number; achievements: Array<{ id: string; name: string }>; activeS: number; kj: number } | null {
  if (!active) return null;
  let summary: Record<string, number | string> = {};
  try { summary = active.sim.summary(); } catch { /* mid-run summary is best effort */ }
  const rec: SessionRecord = active.recorder.finish({ profileId: profile.id, gameId: activeGameId, startedAt: Date.now(), gameSummary: summary });
  const r: any = awardSession(profile, rec);
  return {
    xp: r.xpGained ?? 0, level: r.profile?.level ?? profile.level,
    achievements: (r.newAchievements ?? []).map((x: any) => ({ id: x.id, name: x.name ?? x.id })),
    activeS: activeSecondsOf(rec), kj: rec.stats.kj,
  };
}
/** Save a finished record and apply XP / achievements to `profile`. */
async function creditRecord(profile: Profile, record: SessionRecord): Promise<{ record: SessionRecord; award: AwardView; profile: Profile }> {
  await sessionStore.save(record);
  const r: any = awardSession(profile, record);
  const next: Profile = r.profile ?? profile;
  await saveProfile(next);
  const award: AwardView = {
    xpGained: r.xpGained ?? 0,
    levelBefore: profile.level, levelAfter: next.level,
    newAchievements: (r.newAchievements ?? []).map((a: any) => (typeof a === 'string' ? { id: a, name: achievementName(a) } : { id: a.id, name: a.name ?? a.id })),
  };
  return { record, award, profile: next };
}

// ---------- warm-up lobby (the ride behind the menus) ----------
/** A warm-up counts (lifetime, XP) once it has this much pedalling on real devices. */
export const WARMUP_CREDIT_S = 120;
const PENDING_KEY = 'wattcade.pendingRide';
let lobby: any = null;
let lobbyMeta: { profileId: string | null; startedAt: number } = { profileId: null, startedAt: 0 };
/** Road position carried across lobby restarts so the scenery never jumps. */
let lobbyCarry: { startDistance: number; startBiome?: number; terrainSeed?: number } = { startDistance: 0 };
const menuPressed = new Set<Button>();
/** Lobby input: ticks the shared InputHub and keeps every press for the menus (several sim steps may run per frame). */
const lobbyInput = {
  beginTick(dt: Seconds) { input.beginTick(dt); for (const b of input.state().pressed) menuPressed.add(b); },
  state: (): Readonly<InputState> => input.state(),
};
export const lobbySession = (): SessionLike | null => lobby;
/** Presses collected by the lobby since the last call (cleared). */
export function takeLobbyPresses(): Set<Button> { const p = new Set(menuPressed); menuPressed.clear(); return p; }
/** True if the current lobby ride is on real devices (fake demo rides never earn credit). */
export const lobbyIsReal = (): boolean => !!lobby && !lobby.fakeBike && !!lobbyMeta.profileId;
const activeSecondsOf = (r: SessionRecord) => r.samples.filter((x) => x.cadence > 20).length;
const creditable = (r: SessionRecord | null): r is SessionRecord => !!r && activeSecondsOf(r) >= WARMUP_CREDIT_S;

/** Start (or restart) the lobby ride. `profile` null = guest (profile picker): rides, never credits. */
export function startLobby(profile: Profile | null): SessionLike {
  if (lobby) stopLobby();
  const p = profile ?? { ...defaultProfile('Guest'), id: 'guest', color: '#00f0ff' };
  input.applySettings(p.settings);
  const useFake = fakeMode || !anyReal();
  const startedAt = Date.now();
  lobby = createGameSession({
    game: lobbyGame, profile: p, input: lobbyInput, dataHub: useFake ? undefined : dataHub,
    fake: useFake ? { script: fakeScript } : false, seed: Math.floor(startedAt / 86400000), simOpts: { ...lobbyCarry },
  });
  lobbyMeta = { profileId: profile?.id ?? null, startedAt };
  menuPressed.clear();
  return lobby;
}
function lobbyRecord(): SessionRecord | null {
  if (!lobby || !lobbyMeta.profileId || lobby.fakeBike) return null;
  return lobby.recorder.finish({ profileId: lobbyMeta.profileId, gameId: lobbyGame.id, startedAt: lobbyMeta.startedAt, gameSummary: lobby.sim.summary() });
}
/** Stop the lobby ride. Returns its record if it is worth crediting (real devices, >= 2 min pedalling). */
export function stopLobby(): SessionRecord | null {
  if (!lobby) return null;
  const snap: any = lobby.sim.snapshot();
  lobbyCarry = { startDistance: snap.d, startBiome: snap.startBiome, terrainSeed: snap.terrainSeed };
  const rec = lobbyRecord();
  lobby.finish(); lobby = null;
  clearPendingRide();
  return creditable(rec) ? rec : null;
}
/** Warm-up road: rolling hills (trainer grade follows the road) or flat. Saved per rider via the tuning registry. */
export const lobbyHills = (): boolean => (lobby?.tuning?.get?.('warmup.hills') ?? true) as boolean;
export function setLobbyHills(on: boolean): void { lobby?.tuning?.set?.('warmup.hills', on); }
/** Ride seconds so far in the lobby (pedalling), for the "End ride" button. */
export const lobbyActiveSeconds = (): number => { const r = lobbyRecord(); return r ? activeSecondsOf(r) : 0; };

/** Credit a warm-up record to its rider. `latest` is used if it is that rider (avoids a stale read). */
export async function creditRide(record: SessionRecord, latest?: Profile | null): Promise<{ record: SessionRecord; award: AwardView; profile: Profile } | null> {
  const p: Profile | undefined = latest?.id === record.profileId ? latest : await profileStore.get(record.profileId);
  if (!p) return null;
  return creditRecord(p, record);
}
/** Checkpoint the running warm-up so a closed tab still gets credit next launch. */
export function checkpointLobby(): void {
  const r = lobbyRecord();
  if (!creditable(r)) return;
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(r)); } catch { /* full or unavailable */ }
}
export function clearPendingRide(): void { try { localStorage.removeItem(PENDING_KEY); } catch { /* ignore */ } }
/** A warm-up checkpointed by a previous page that never ended cleanly. */
export function takePendingRide(): SessionRecord | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY); if (!raw) return null;
    localStorage.removeItem(PENDING_KEY);
    const r = JSON.parse(raw) as SessionRecord;
    return r && typeof r.profileId === 'string' && Array.isArray(r.samples) ? r : null;
  } catch { return null; }
}

// ---------- trainer test + debug ----------
export function applyTest(cmd: TrainerCommand): void {
  const s: any = current();
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
  const s: any = current();
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
    controllerInfo, trainerDetail: status.trainer.detail ?? status.trainer.error,
  };
}
/** Difficulty of the running session's mixer (starts from the profile setting), else the last value set. */
export const getDifficulty = (): number => any(current())?.mixer?.getDifficulty?.() ?? debugState.difficulty;
/** Live readings from the real devices (Connect screen). */
export const liveDevices = () => dataHub.store.get();
const debugState = { difficulty: 1, timeScale: 1 };
export const debugActions: DebugActions = {
  setDifficulty(v) { debugState.difficulty = v; any(current())?.mixer?.setDifficulty(v); },
  setTimeScale(v) { debugState.timeScale = v; const c = current(); if (c?.ctx) c.ctx.clock.timeScale = v; },
  panic(on) { any(current())?.mixer?.panic(on); },
  applyTest,
  setTuning(k, v) { any(current())?.tuning?.set(k, v); },
  resetTuning() { any(current())?.tuning?.reset(); },
  setFakeScript(n) { fakeScript = n; any(current())?.fakeBike?.useScript(n === 'manual' ? null : n); },
  fakeAdjust(k, d) {
    const fb = any(current())?.fakeBike; if (!fb) return;
    if (fb.script) {   // switch to manual control, seeded from current values so nothing jumps
      const r = any(current()).ctx.bike().raw; fb.useScript(null);
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
