// Drive-In state shared by the lobby menu button, the channel keys and the screen component. Persisted per rider.
import type { Button } from '../../contracts';
import { clearBad, DEFAULT_SAVED, flip, initialDial, markBad, parseSaved, storageKey, type Dial } from './channels';

export interface DriveInState { profileId: string | null; on: boolean; sound: boolean; dial: Dial; /** bumps on every flip so the screen can play its effects */ flips: number }

let st: DriveInState = { profileId: null, on: false, sound: false, dial: initialDial(), flips: 0 };
let visible = false;
const subs = new Set<() => void>();
const emit = () => { for (const f of [...subs]) f(); };
const save = () => {
  if (!st.profileId) return;
  try { localStorage.setItem(storageKey(st.profileId), JSON.stringify({ on: st.on, ch: st.dial.id, sound: st.sound })); } catch { /* private mode */ }
};
const set = (p: Partial<DriveInState>) => { st = { ...st, ...p }; save(); emit(); };

export const getDriveIn = (): Readonly<DriveInState> => st;
export function subscribeDriveIn(cb: () => void): () => void { subs.add(cb); return () => { subs.delete(cb); }; }

/** Switch rider: restore their on/off, last channel and sound choice (guest = off). */
export function loadDriveIn(profileId: string | null): void {
  let saved = DEFAULT_SAVED;
  if (profileId) { try { saved = parseSaved(localStorage.getItem(storageKey(profileId))); } catch { /* ignore */ } }
  st = { profileId, on: profileId ? saved.on : false, sound: saved.sound, dial: initialDial(saved.ch), flips: st.flips };
  emit();
}
export function toggleDriveIn(): boolean { set({ on: !st.on, dial: clearBad(st.dial) }); return st.on; }
export function setDriveInSound(sound: boolean): void { if (sound !== st.sound) set({ sound }); }
/** Next (+1) / previous (-1) channel. */
export function flipChannel(dir: 1 | -1): void { set({ dial: flip(st.dial, dir), flips: st.flips + 1 }); }
/** The channel keeps failing: mark it unavailable and move on. */
export function skipBadChannel(): void { set({ dial: flip(markBad(st.dial, st.dial.id), 1), flips: st.flips + 1 }); }

/** The screen is showing (the lobby menu screen is up). Set by the App. */
export function setDriveInVisible(v: boolean): void { if (v !== visible) { visible = v; emit(); } }
export const driveInActive = (): boolean => st.on && visible;

/** Controller: Y = next, Z = previous. Returns true if the press set had a channel key and it was used (so it neither wakes the menus nor navigates). */
export function handleChannelPress(pressed: ReadonlySet<Button>): boolean {
  if (!driveInActive()) return false;
  const y = pressed.has('y'), z = pressed.has('z');
  if (y === z) return false;
  flipChannel(y ? 1 : -1);
  return true;
}
