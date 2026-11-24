// What this device runs for each game (pins), skipped logic changes and save backups. localStorage, per profile.
// Pins are the client-side "release": a fresh page load starts each game from its pinned layers.
import type { Layers } from './feed';
import { BUILT_IN } from './feed';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const storage = (): StorageLike | null => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; } };

export interface GameLive { pins: Layers; skippedSim: string | null }
export interface SaveBackup { time: number; beforeSim: string | null; afterSim: string | null; data: unknown }

const BACKUPS = 5;

export class LiveStore {
  constructor(private profileId: string, private store: StorageLike | null = storage()) {}

  private key(gameId: string, what: string) { return `wattcade.live.${this.profileId}.${gameId}.${what}`; }
  private read<T>(k: string, def: T): T { try { const raw = this.store?.getItem(k); return raw ? JSON.parse(raw) as T : def; } catch { return def; } }
  private write(k: string, v: unknown) { try { if (v === null) this.store?.removeItem(k); else this.store?.setItem(k, JSON.stringify(v)); } catch { /* full or blocked */ } }

  game(gameId: string): GameLive { return this.read(this.key(gameId, 'state'), { pins: { ...BUILT_IN }, skippedSim: null }); }
  setPins(gameId: string, pins: Layers) { this.write(this.key(gameId, 'state'), { ...this.game(gameId), pins }); }
  skipSim(gameId: string, simHash: string | null) { this.write(this.key(gameId, 'state'), { ...this.game(gameId), skippedSim: simHash }); }

  /** The sim layer the game last started with (to notice a logic change and back up its save first). */
  lastStartedSim(gameId: string): string | null | undefined { return this.read<{ sim: string | null } | null>(this.key(gameId, 'started'), null)?.sim; }
  setStartedSim(gameId: string, sim: string | null) { this.write(this.key(gameId, 'started'), { sim }); }

  backups(gameId: string): SaveBackup[] { return this.read<SaveBackup[]>(this.key(gameId, 'backups'), []); }
  backup(gameId: string, b: SaveBackup) { this.write(this.key(gameId, 'backups'), [b, ...this.backups(gameId)].slice(0, BACKUPS)); }

  /** A backup to restore the next time the game starts (index into backups()), or null. */
  pendingRestore(gameId: string): number | null { return this.read<number | null>(this.key(gameId, 'restore'), null); }
  setPendingRestore(gameId: string, i: number | null) { this.write(this.key(gameId, 'restore'), i); }
}
