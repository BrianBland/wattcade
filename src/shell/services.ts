/**
 * The ONLY shell file that imports core / input / progression / devices.
 * Written against the CLAUDE.md "Integration seams"; guessed signatures are
 * isolated behind `any` adapters here so fixes stay local.
 */
import type { SongAnalysis, SongMeta } from '../media';
import { unitsFor, measurementText } from '../units';
import type { Button, GameModule, InputState, MediaTimeline, Profile, Seconds, SessionRecord, TrainerCommand, ResistanceEffect } from '../contracts';
import { RollingQueue, estimatedAnalysis, mediaServerConfig, loadAudioRange, loadOnlineAudio, ANALYSIS_SR, IdbStorage, MediaLibrary, MixEngine, analyzeInWorker, analyzeWindowInWorker, decodeMono, paletteFromImageBlob, renderSynthWav } from '../media';
import { createGameSession, DataHub, SCRIPTS } from '../core';
import { InputHub } from '../input';
import { ProfileStore, SessionStore, awardSession, defaultProfile, levelForXp, xpForLevel, ACHIEVEMENTS, ACHIEVEMENT_GAME, achievementProgress } from '../progression';
import { getGame, lobbyGame } from '../games/registry';
import { choosePick, equip, newUnlocks, pendingPicks, unlockHint } from '../cosmetics/unlocks';
import type { Item, Slot } from '../cosmetics/types';
import { readSavedSetup, rememberDevices, resolveSavedSetup } from './savedSetup';
import { discoverSavedDevice } from './savedDiscovery';
import { bluetoothLog, bluetoothLogText, bluetoothError, ConnectionCancelled, type ConnectionOptions } from '../devices/bluetooth/lifecycle';
import { getDriveIn } from './drivein/store';
import { ridesByGame, type GameRides } from './arcade';
import { BIOMES } from '../games/warmup/sim/terrain';
import { FtmsTrainer } from '../devices/ftms';
import { HeartRateMonitor } from '../devices/hr';
import { RideControllerGroup } from '../devices/zwiftRide';
import type { AchievementView, AwardView, DeviceKind, DeviceStatusMap, LevelView, SessionLike, MediaRun } from './types';
import type { DebugActions, DebugSnapshot, TuningEntry } from '../debug/types';

/* eslint-disable @typescript-eslint/no-explicit-any */
const any = <T = any>(x: unknown) => x as T;

export const input = new InputHub({ debounceMs: 90 });
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
/** This rider's ride count / time / kJ per game, from saved sessions (for the arcade picker). */
export async function gameRides(profileId: string): Promise<Record<string, GameRides>> {
  try { return ridesByGame(await sessionStore.list(profileId)); } catch { return {}; }
}
export async function lastProfileId(): Promise<string | null> { return (await profileStore.getLastProfileId?.()) ?? null; }
export async function rememberProfile(id: string): Promise<void> { await profileStore.setLastProfileId?.(id); }

// ---------- progression views ----------
export function levelView(xp: number): LevelView {
  const level = levelForXp(xp);
  const lo = xpForLevel(level), hi = xpForLevel(level + 1);
  return { level, xp, nextXp: hi, progress: hi > lo ? Math.min(1, Math.max(0, (xp - lo) / (hi - lo))) : 0 };
}
export function achievementViews(p: Profile): AchievementView[] {
  return ACHIEVEMENTS.map((a) => {
    const unlocked = p.achievements.includes(a.id), gameId = ACHIEVEMENT_GAME[a.id];
    const progress = unlocked ? null : achievementProgress(a, p);
    return {
      id: a.id, name: a.name, desc: measurementText(a.desc, unitsFor(p)), unlocked, secret: !!a.secret,
      gameId, group: gameId ? getGame(gameId)?.title ?? gameId : 'Everywhere',
      progress: progress ? { ...progress, label: measurementText(progress.label, unitsFor(p)) } : null,
    };
  });
}
const achievementName = (id: string) => ACHIEVEMENTS.find((a) => a.id === id)?.name ?? id;

// ---------- cosmetics (Locker, reward picks) ----------
/** How to unlock a locked item ("Reach level 12", "Earn “Leg Day”"). */
export const itemHint = (it: Item): string => unlockHint(it, (id) => ACHIEVEMENTS.find((a) => a.id === id));
/** Equip an item and save the profile. Returns the updated profile (unchanged if the item is locked). */
export async function equipItem(p: Profile, slot: Slot, id: string): Promise<Profile> {
  const next = equip(p, slot, id);
  if (next !== p) await saveProfile(next);
  return next;
}
/** Take the reward picked at `level` (it is equipped too) and save. */
export async function pickReward(p: Profile, level: number, id: string): Promise<Profile> {
  const next = choosePick(p, level, id);
  if (next !== p) await saveProfile(next);
  return next;
}
export { pendingPicks };

// ---------- devices ----------
let fakeMode = false;
let fakeScript = 'z2';
const status: DeviceStatusMap = { trainer: { connected: false }, controller: { connected: false }, hr: { connected: false } };
const devices: Partial<Record<DeviceKind, any>> = {};
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
export const getFake = () => fakeMode;
export function setFake(on: boolean) { fakeMode = on; notify(); }
/** Why `game` can't start with the connected devices, or null. Only a real trainer can lack ERG (the fake bike supports it). */
export function missingRequirement(game: GameModule): string | null {
  if (!game.requires?.erg || fakeMode || !devices.trainer) return null;
  return dataHub.capabilities()?.erg === false ? `${game.title} needs a trainer with ERG mode` : null;
}
export const getDeviceStatus = (): DeviceStatusMap => status;
export function subscribeDevices(cb: () => void): () => void { listeners.add(cb); return () => listeners.delete(cb); }
export let controllerInfo: { firmware?: string; battery?: number; warning?: string } = {};

const connectionScopes: Partial<Record<DeviceKind, AbortController>> = {};
const restorationCanceled = new Set<DeviceKind>();
const deviceOffs: Partial<Record<DeviceKind, Array<() => void>>> = {};
export function downloadBluetoothLog(): void {
  const url = URL.createObjectURL(new Blob([bluetoothLogText()], { type: 'text/plain' }));
  const a = document.createElement('a'); a.href = url; a.download = 'wattcade-bluetooth.txt'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function retireDevice(kind: DeviceKind): Promise<void> {
  const d = devices[kind]; delete devices[kind];
  deviceOffs[kind]?.forEach(off => off()); delete deviceOffs[kind];
  if (kind === 'trainer') dataHub.detachTrainer();
  else if (kind === 'hr') dataHub.detachHr();
  else { dataHub.detachController(); input.setControllerState({ buttons: new Set(), paddleL: 0, paddleR: 0 }); }
  await d?.disconnect();
}

const authorizedHrDevices = new Map<string, BluetoothDevice>();
let hrConnectionAttempt = 0;
export function savedHrWatches(): Array<{ id: string; name: string; selected: boolean }> {
  return (readSavedSetup().hr ?? []).flatMap((id) => {
    const device = authorizedHrDevices.get(id);
    return device ? [{ id, name: device.name ?? 'HR watch', selected: devices.hr?.id === id && status.hr.connected }] : [];
  });
}
/** Switch to a saved authorized watch without opening the browser picker. */
export async function selectSavedHrWatch(id: string): Promise<void> {
  if (status.hr.busy || (devices.hr?.id === id && status.hr.connected)) return;
  const device = authorizedHrDevices.get(id);
  if (!device) { status.hr = { connected: false, error: 'Saved watch permission is unavailable. Use Add watch to select it again.' }; notify(); return; }
  await openDevice('hr', [device]);
}

/** Must be called from a user gesture. */
export async function connectDevice(kind: DeviceKind): Promise<void> {
  if (status[kind].busy) return;
  return openDevice(kind);
}

async function openDevice(kind: DeviceKind, granted?: BluetoothDevice[], automatic = false): Promise<void> {
  if (!automatic) restorationCanceled.add(kind);
  const previousStatus = status[kind];
  const previousScope = connectionScopes[kind];
  const scope = new AbortController(); connectionScopes[kind] = scope;
  const owns = () => connectionScopes[kind] === scope && !scope.signal.aborted;
  const check = () => { if (!owns()) throw new ConnectionCancelled(); };
  const replace = async () => { check(); previousScope?.abort(); await retireDevice(kind); check(); };
  const options: ConnectionOptions = { signal: scope.signal, beforeConnect: replace };
  const onLog = (s: string) => bluetoothLog(`${kind}: ${s}`);
  const hrAction = automatic ? 'Automatic watch connection' : granted ? 'Saved watch retry' : 'Watch selection';
  const hrAttempt = kind === 'hr' ? ++hrConnectionAttempt : 0;
  if (typeof navigator === 'undefined' || !(navigator as any).bluetooth) {
    status[kind] = { connected: false, error: 'Web Bluetooth unavailable — use Bluefy on iPad or Chrome on desktop (HTTPS or localhost).' }; notify(); return;
  }
  status[kind] = { connected: false, busy: true, detail: kind === 'hr' ? `${hrAction} #${hrAttempt}: starting` : granted?.[0]?.name ? `Connecting to ${granted[0].name}` : undefined }; notify();
  try {
    bluetoothLog(`${kind}: ${automatic ? 'saved startup' : granted ? 'saved selection' : 'picker selection'} started`);
    if (granted) await replace();
    const hub: any = dataHub;
    if (kind === 'trainer') {
      const progress = (detail: string) => { if (!owns()) return; status.trainer = { connected: false, busy: !detail.startsWith('Reconnect failed'), detail }; notify(); };
      if (granted) await discoverSavedDevice(granted[0], progress, scope.signal);
      const d = granted ? await FtmsTrainer.connectDevice(granted[0], progress, onLog, options) : await FtmsTrainer.connect(progress, onLog, options);
      check(); devices.trainer = d;
      deviceOffs.trainer = [hub.attachTrainer(d), d.onStatus((st) => { if (devices.trainer !== d) return; status.trainer = { ...status.trainer, connected: st.connected, busy: !st.connected && !!st.detail && st.detail !== 'closed' && !st.detail.startsWith('Reconnect failed'), detail: st.detail }; notify(); })];
      rememberDevices(kind, [d.id]);
    }
    else if (kind === 'hr') {
      let connectingName = 'HR watch';
      const progress = (step: string) => { if (!owns()) return; status.hr = { connected: false, busy: !step.startsWith('Reconnect failed'), detail: `${hrAction} #${hrAttempt} · ${connectingName}: ${step}` }; notify(); };
      let d: HeartRateMonitor | undefined;
      if (granted) {
        const errors: string[] = [];
        for (const device of granted) {
          connectingName = device.name ?? 'HR watch';
          try {
            await discoverSavedDevice(device, progress, scope.signal);
            d = await HeartRateMonitor.connectDevice(device, progress, onLog, options); break;
          }
          catch (e) { check(); errors.push(`${device.name ?? 'HR watch'}: ${e instanceof Error ? e.message : String(e)}`); }
        }
        if (!d) throw new Error('Saved watch connection failed. Enable HR broadcast, or tap Select watch again to open the picker. ' + errors.join(' · '));
      } else d = await HeartRateMonitor.connect(progress, onLog, options);
      check(); devices.hr = d;
      deviceOffs.hr = [hub.attachHr(d), d.onStatus((st) => { if (devices.hr !== d) return; status.hr = { ...status.hr, connected: st.connected, busy: false, detail: st.connected ? d.name : status.hr.detail }; notify(); })];
      authorizedHrDevices.set(d.id, d.bluetoothDevice);
      status.hr.detail = d.name;
      rememberDevices(kind, [d.id]);
    }
    else {
      // The Ride's two sides may appear as two devices; the group merges them. First tap adds one side.
      const g = new RideControllerGroup();
      g.onStatus((s) => { if (!owns() || devices.controller !== g) return; controllerInfo = { firmware: s.firmware ?? controllerInfo.firmware, battery: s.battery ?? controllerInfo.battery, warning: s.warning ?? controllerInfo.warning }; status.controller = { ...status.controller, connected: s.connected, busy: !!s.detail && !s.detail.startsWith('Reconnect failed'), detail: s.detail ?? s.warning }; notify(); });
      g.onLog(onLog);
      if (granted) {
        const errors: string[] = [];
        for (const device of granted) {
          try {
            await discoverSavedDevice(device, detail => { if (!owns()) return; status.controller = { connected: false, busy: true, detail: `${device.name ?? 'Controller'}: ${detail}` }; notify(); }, scope.signal);
            await g.addDevice(device, options, detail => { if (!owns()) return; status.controller.detail = detail; notify(); });
          }
          catch (e) { check(); errors.push(e instanceof Error ? e.message : String(e)); }
        }
        if (!g.count) throw new Error(errors.join(' · '));
        if (errors.length) status.controller.error = 'One controller could not connect: ' + errors.join(' · ');
      } else await g.addFromPicker(options);
      check(); devices.controller = g; deviceOffs.controller = [hub.attachController(g, input)];
      // Preserve missing/offline saved sides during restoration.
      if (!granted) rememberDevices(kind, g.ids);
    }
    check(); bluetoothLog(`${kind}: ready`);
    status[kind] = { connected: true, detail: status[kind].detail, error: status[kind].error };
  } catch (e) {
    bluetoothLog(`${kind}: ${bluetoothError(e)}`);
    if (!owns()) return;
    if (devices[kind] && previousScope && !previousScope.signal.aborted) { connectionScopes[kind] = previousScope; scope.abort(); }
    status[kind] = { connected: devices[kind] ? previousStatus.connected : false, detail: kind === 'hr' ? `${hrAction} #${hrAttempt} failed` : undefined, error: e instanceof Error ? e.message : String(e) };
  }
  notify();
}
// Restore once per page load, independently of player selection or menu revisits.
let restoringSetup: Promise<void> | undefined;
export function restoreSavedSetup(): Promise<void> {
  return restoringSetup ??= restoreSetup();
}
async function restoreSetup(): Promise<void> {
  const saved = readSavedSetup();
  const kinds = (['hr', 'trainer', 'controller'] as DeviceKind[]).filter((kind) => saved[kind]?.length).filter((kind) => !status[kind].busy && !devices[kind]);
  if (!kinds.length) return;
  for (const kind of kinds) status[kind] = { connected: false, busy: true, detail: 'Finding saved device' };
  notify();
  try {
    const bluetooth = typeof navigator === 'undefined' ? undefined : navigator.bluetooth;
    if (!bluetooth?.getDevices) throw new Error('Automatic connection is unavailable because this browser does not expose getDevices(). Select devices manually. Desktop Chrome may need its Web Bluetooth permissions flag enabled.');
    const granted = resolveSavedSetup(saved, await bluetooth.getDevices());
    for (const device of granted.hr ?? []) authorizedHrDevices.set(device.id, device);
    // Serialize GATT setup to avoid overloading the iPad's Bluetooth bridge.
    for (const kind of kinds) {
      if (restorationCanceled.has(kind)) continue;
      if (!granted[kind]?.length) {
        status[kind] = { connected: false, error: 'Choose your device to reconnect; saved permission is unavailable.' };
      } else {
        await openDevice(kind, granted[kind], true);
        if (kind === 'controller' && status[kind].connected && granted[kind]!.length < saved[kind]!.length) {
          status[kind].error = 'A saved controller needs to be selected again. Use Add other side.';
        }
      }
      notify();
    }
  } catch (e) {
    for (const kind of kinds) if (!restorationCanceled.has(kind)) status[kind] = { connected: false, error: e instanceof Error ? e.message : String(e) };
    notify();
  }
}

/** Number of Ride controllers (sides) connected. */
export const controllerCount = (): number => (devices.controller as RideControllerGroup | undefined)?.count ?? 0;

/** Must be called from a user gesture. Connects the other Ride side into the existing group. */
export async function addSecondController(): Promise<void> {
  if (status.controller.busy) return;
  const g = devices.controller as RideControllerGroup | undefined;
  if (!g) return connectDevice('controller');
  const scope = connectionScopes.controller;
  const owns = () => devices.controller === g && connectionScopes.controller === scope && !scope?.signal.aborted;
  status.controller = { ...status.controller, busy: true, error: undefined }; notify();
  try { await g.addFromPicker({ signal: scope?.signal }); if (!owns()) return; rememberDevices('controller', g.ids); status.controller = { ...status.controller, busy: false }; }
  catch (e) { if (!owns()) return; status.controller = { ...status.controller, busy: false, error: e instanceof Error ? e.message : String(e) }; }
  notify();
}
export async function disconnectDevice(kind: DeviceKind): Promise<void> {
  restorationCanceled.add(kind);
  connectionScopes[kind]?.abort(); delete connectionScopes[kind];
  await retireDevice(kind); status[kind] = { connected: false }; notify();
}
const anyReal = () => Object.keys(devices).length > 0;

// ---------- sessions ----------
let active: any = null;
let activeGameId = '';
export const activeSession = (): SessionLike | null => active;
/** The game session if one is running, else the warm-up lobby (for debug + fake keys). */
const current = (): any => active ?? lobby;

export function startSession(game: GameModule, profile: Profile, onSave: (d: unknown) => void, media?: { timeline: MediaTimeline; announce?(id: string, t: number): void }): SessionLike {
  input.applySettings(profile.settings); debugState.timeScale = 1;
  const useFake = fakeMode || !anyReal();
  activeGameId = game.id;
  active = createGameSession({
    game, profile, input, dataHub: useFake ? undefined : dataHub,
    fake: useFake ? { script: fakeScript } : false, onSave, media,
  });
  return active;
}

// ---------- media (music library + player; SPEC §5.6) ----------
let library: MediaLibrary | null = null;
let engine: MixEngine | null = null;
/** The rider's music library (IndexedDB) plus the built-in demo songs. Created on first use. */
export function mediaLibrary(): MediaLibrary {
  if (!library) {
    library = new MediaLibrary({
      storage: new IdbStorage(),
      loadOnlineAudio,
      analyze: async (blob, progress) => {
        progress(0, 'decoding');
        const { pcm } = await decodeMono(await blob.arrayBuffer(), ANALYSIS_SR);
        return analyzeInWorker(pcm, ANALYSIS_SR, progress);
      },
      renderSynth: async (score) => new Blob([await renderSynthWav(score) as BlobPart], { type: 'audio/wav' }),
      artPalette: paletteFromImageBlob,
    });
    void library.resume();
  }
  return library;
}
/** One shared music player (one AudioContext for the app). */
export function mediaEngine(): MixEngine {
  if (!engine) engine = new MixEngine({ resolveUrl: (id) => mediaLibrary().audioUrl(id), latencyS: () => Number(localStorage.getItem('wattcade.media.latencyMs') ?? 0) / 1000 });
  return engine;
}
/** Streaming runs keep only the configured horizon decoded; analysis is per audio window. */
/** Mono PCM at ANALYSIS_SR from a decoded buffer (linear resample). */
function downmix(buffer: AudioBuffer): Float32Array {
  const pcm = new Float32Array(Math.floor(buffer.duration * ANALYSIS_SR));
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
  for (let i = 0; i < pcm.length; i++) {
    const x = i * buffer.sampleRate / ANALYSIS_SR, k = Math.floor(x), f = x - k;
    for (const ch of channels) pcm[i] += ((ch[k] ?? 0) * (1 - f) + (ch[k + 1] ?? ch[k] ?? 0) * f) / channels.length;
  }
  return pcm;
}
/** Picker preview: fetch one range of a streamed song and analyze it. The decoded audio is dropped right away (analysis only). */
export async function analyzeStreamWindow(song: SongMeta, startS: number, durationS: number, signal: AbortSignal): Promise<SongAnalysis> {
  const data = await loadAudioRange(song, startS, durationS, mediaServerConfig(), signal);
  const pcm = downmix(await mediaEngine().ctx.decodeAudioData(data));
  if (signal.aborted) throw new Error('Preview was cancelled.');
  return analyzeInWorker(pcm, ANALYSIS_SR, () => {});
}
export async function rollingMediaRun(ids: string[], mode: import('../media').QueueMode): Promise<MediaRun> {
  const lib = mediaLibrary(), config = mediaServerConfig(), ctx = mediaEngine().ctx;
  if (!config.enabled) throw new Error('Enable the media server on Connect first.');
  const metas = await Promise.all(ids.map((id) => lib.get(id)));
  if (metas.some((m) => !m)) throw new Error('A queued song is missing.');
  const items = await Promise.all(metas.map(async (meta) => {
    const m = meta!;
    if (m.sourceUrl) return { id: m.id, title: m.title, artist: m.artist, palette: m.palette, credit: m.credit, analysis: estimatedAnalysis(m.durationS) };
    const item = await lib.mixItem(m.id); if (!item) throw new Error(`Still preparing ${m.title}.`); return structuredClone(item);
  }));
  const local = new Map<number, AudioBuffer>();
  const rolling = new RollingQueue(items, mode, config.bufferS, async (index, startS, durationS, signal, hint) => {
    const meta = metas[index]!;
    let buffer: AudioBuffer;
    if (meta.sourceUrl) {
      const data = await loadAudioRange(meta, startS, durationS, config, signal);
      buffer = await ctx.decodeAudioData(data);
    } else {
      let full = local.get(index);
      if (!full) {
        full = await ctx.decodeAudioData(await (await fetch(await lib.audioUrl(meta.id), { signal })).arrayBuffer());
        for (const k of local.keys()) if (k < index - 1) local.delete(k);
        local.set(index, full);
      }
      const from = Math.round(startS * full.sampleRate), length = Math.min(Math.round(durationS * full.sampleRate), full.length - from);
      buffer = ctx.createBuffer(full.numberOfChannels, length, full.sampleRate);
      for (let c = 0; c < full.numberOfChannels; c++) buffer.copyToChannel(full.getChannelData(c).subarray(from, from + length), c);
    }
    if (signal.aborted) throw new Error('Media queue was closed.');
    // Mono 22.05 kHz copy for analysis; only compact per-beat features come back (structure is rebuilt from them).
    const { analysis, beats } = await analyzeWindowInWorker(downmix(buffer), ANALYSIS_SR, hint?.bpm);
    return { buffer, analysis, beats };
  });
  return { ids, mode, items, plan: rolling.plan, timeline: rolling.timeline, rolling };
}
/** Call from user gestures (iOS only lets audio start from one). Cheap after the first time. */
export function unlockMedia(): void { try { mediaEngine().unlock(); } catch { /* no Web Audio */ } }
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
    newItems: newUnlocks(profile, next).map((it) => ({ slot: it.slot, id: it.id, name: it.name })),
    picks: pendingPicks(next).length,
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
let lobbyCarry: { startDistance: number; startBiome?: number; terrainSeed?: number } = lobbyDebugStart();
/** `?biome=desert&at=0.9` starts the lobby ride in that biome, `at` km in (debug aid for screenshots). */
function lobbyDebugStart(): { startDistance: number; startBiome?: number } {
  try {
    const q = new URLSearchParams(globalThis.location?.search ?? ''), i = (BIOMES as readonly string[]).indexOf(q.get('biome') ?? '');
    return i < 0 ? { startDistance: 0 } : { startDistance: Number(q.get('at') ?? 0) * 1000, startBiome: i };
  } catch { return { startDistance: 0 }; }
}
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
    fake: useFake ? { script: fakeScript } : false, seed: Math.floor(startedAt / 86400000), simOpts: { ...lobbyCarry, driveIn: getDriveIn().on },
  });
  lobbyMeta = { profileId: profile?.id ?? null, startedAt };
  menuPressed.clear();
  activeSamplesSeen = activeSamplesCount = 0;
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
let activeSamplesSeen = 0, activeSamplesCount = 0;
export const lobbyActiveSeconds = (): number => {
  if (!lobbyIsReal()) return 0;
  const samples: SessionRecord['samples'] = lobby.recorder.samples;
  for (; activeSamplesSeen < samples.length; activeSamplesSeen++) {
    if (samples[activeSamplesSeen].cadence > 20) activeSamplesCount++;
  }
  return activeSamplesCount;
};

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
