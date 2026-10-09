import type { DeviceKind } from './types';

export const SAVED_SETUP_KEY = 'wattcade.devices.v1';
export type SavedSetup = Partial<Record<DeviceKind, string[]>>;
const KINDS: DeviceKind[] = ['trainer', 'controller', 'hr'];

/** Device preferences belong to this browser/origin, shared by all players. */
export function readSavedSetup(): SavedSetup {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(SAVED_SETUP_KEY) ?? '{}');
    if (!raw || typeof raw !== 'object') return {};
    const saved: SavedSetup = {};
    for (const kind of KINDS) {
      const ids = (raw as SavedSetup)[kind];
      if (Array.isArray(ids)) {
        const valid = [...new Set(ids.filter((id): id is string => typeof id === 'string' && !!id))].slice(0, kind === 'hr' ? undefined : kind === 'controller' ? 2 : 1);
        if (valid.length) saved[kind] = valid;
      }
    }
    return saved;
  } catch { return {}; }
}

export function rememberDevices(kind: DeviceKind, ids: string[]): void {
  try {
    const saved = readSavedSetup();
    // HR is a shared pool of watches; most recently used goes first.
    const next = kind === 'hr' ? [...new Set([...ids, ...(saved.hr ?? [])])] : ids;
    localStorage.setItem(SAVED_SETUP_KEY, JSON.stringify({ ...saved, [kind]: next }));
  }
  catch { /* Storage can be unavailable; manual connection still works. */ }
}

/** Match permissions by ID, never by ambiguous advertised names. No picker. */
export function resolveSavedSetup(saved: SavedSetup, granted: BluetoothDevice[]): Partial<Record<DeviceKind, BluetoothDevice[]>> {
  const byId = new Map(granted.map((device) => [device.id, device]));
  const result: Partial<Record<DeviceKind, BluetoothDevice[]>> = {};
  for (const kind of KINDS) {
    if (saved[kind]?.length) result[kind] = saved[kind]!.flatMap((id) => byId.has(id) ? [byId.get(id)!] : []);
  }
  return result;
}
