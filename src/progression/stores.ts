import { createStore, get, set, update as updateValue, del, keys, getMany, type UseStore } from 'idb-keyval';
import type { Profile, SessionRecord } from '../contracts';
import { defaultProfile, defaultSettings } from './defaults';
import { migrateProfile, migrateSessionRecord } from '../core/renames';
import { rebalanceProfile } from './rebalance';
import { migrateCosmetics } from '../cosmetics/migrate';

const MAX_SESSIONS = 200;

export class ProfileStore {
  private store: UseStore;
  constructor(dbName = 'wattcade-profiles') {
    this.store = createStore(dbName, 'kv');
  }
  private norm(p: Profile): Profile {
    const m = migrateCosmetics(rebalanceProfile(migrateProfile(p)));
    return { ...m, settings: { ...defaultSettings(), ...m.settings } };
  }
  /** The one-time ownership write must not overwrite a concurrent game checkpoint. */
  private async readNormalized(p: Profile): Promise<Profile | undefined> {
    const normalized = this.norm(p);
    if (p.cosmetics?.rotation === normalized.cosmetics?.rotation) return normalized;
    let saved: Profile | undefined;
    await updateValue<Profile | undefined>(p.id, current => {
      saved = current ? this.norm(current) : undefined;
      return saved;
    }, this.store);
    return saved;
  }
  async list(): Promise<Profile[]> {
    const ks = (await keys(this.store)).filter((k) => typeof k === 'string' && k.startsWith('p_')) as string[];
    const raw = (await getMany<Profile>(ks, this.store)).filter((p): p is Profile => !!p);
    const ps = (await Promise.all(raw.map(p => this.readNormalized(p)))).filter((p): p is Profile => !!p);
    return ps.sort((a, b) => a.createdAt - b.createdAt);
  }
  async get(id: string): Promise<Profile | undefined> {
    const p = await get<Profile>(id, this.store);
    if (!p) return undefined;
    return this.readNormalized(p);
  }
  async create(name: string, init: Partial<Profile> = {}): Promise<Profile> {
    const p: Profile = this.norm({ ...defaultProfile(name), ...init, name });
    await set(p.id, p, this.store);
    return p;
  }
  async update(p: Profile): Promise<Profile> {
    await set(p.id, p, this.store);
    return p;
  }
  /**
   * Apply XP, achievements, and cosmetics without touching game saves.
   * A checkpoint may have landed after the snapshot this award was computed from.
   */
  async award(p: Profile): Promise<Profile> {
    let saved!: Profile;
    await updateValue<Profile>(p.id, (current) => {
      const stored = current ? this.norm(current).gameData : {};
      const games = Object.fromEntries(Object.entries(stored).filter(([id]) => !id.startsWith('_')));
      const progression = { ...stored, ...p.gameData };
      const kept = Object.fromEntries(Object.entries(progression).filter(([id]) => id.startsWith('_')));
      saved = { ...p, gameData: { ...games, ...kept } };
      return saved;
    }, this.store);
    return saved;
  }
  /** Replace one game's save without rewriting XP, settings, or any other game. */
  async updateGameData(profileId: string, gameId: string, data: unknown): Promise<void> {
    if (!gameId || gameId.startsWith('_')) throw new Error('Invalid game id');
    await updateValue<Profile>(profileId, (current) => {
      if (!current) throw new Error('The player profile no longer exists');
      return { ...current, gameData: { ...current.gameData, [gameId]: structuredClone(data) } };
    }, this.store);
  }
  async delete(id: string): Promise<void> {
    await del(id, this.store);
    if ((await this.getLastProfileId()) === id) await del('lastProfileId', this.store);
  }
  async getLastProfileId(): Promise<string | undefined> {
    return get<string>('lastProfileId', this.store);
  }
  async setLastProfileId(id: string): Promise<void> {
    await set('lastProfileId', id, this.store);
  }
  async exportJson(): Promise<string> {
    return JSON.stringify({ version: 1, lastProfileId: await this.getLastProfileId() ?? null, profiles: await this.list() }, null, 2);
  }
  /** Merges by id (imported wins). Returns number of profiles imported. */
  async importJson(json: string): Promise<number> {
    const data = JSON.parse(json) as { version?: number; lastProfileId?: string | null; profiles?: Profile[] };
    if (!data || !Array.isArray(data.profiles)) throw new Error('Invalid wattcade backup');
    for (const p of data.profiles) {
      if (!p || typeof p.id !== 'string' || typeof p.name !== 'string') throw new Error('Invalid profile in backup');
    }
    for (const p of data.profiles) await set(p.id, this.norm(p), this.store);
    if (data.lastProfileId) await this.setLastProfileId(data.lastProfileId);
    return data.profiles.length;
  }
}

export class SessionStore {
  private store: UseStore;
  constructor(dbName = 'wattcade-sessions') {
    this.store = createStore(dbName, 'kv');
  }
  // One key per session (sortable by startedAt) so a save never rewrites other sessions.
  private prefix(profileId: string) { return `s:${profileId}:`; }
  private async keysFor(profileId: string): Promise<string[]> {
    const pre = this.prefix(profileId);
    return ((await keys(this.store)) as string[]).filter((k) => typeof k === 'string' && k.startsWith(pre)).sort();
  }
  async save(record: SessionRecord): Promise<void> {
    const k = `${this.prefix(record.profileId)}${String(Math.floor(record.startedAt)).padStart(15, '0')}:${record.id}`;
    await set(k, record, this.store);
    const ks = await this.keysFor(record.profileId);
    for (const old of ks.slice(0, Math.max(0, ks.length - MAX_SESSIONS))) await del(old, this.store);
  }
  /** Newest first. */
  async list(profileId: string, limit = MAX_SESSIONS): Promise<SessionRecord[]> {
    const ks = (await this.keysFor(profileId)).reverse().slice(0, limit);
    return (await getMany<SessionRecord>(ks, this.store)).filter((r): r is SessionRecord => !!r).map(migrateSessionRecord);
  }
  async clear(profileId: string): Promise<void> {
    for (const k of await this.keysFor(profileId)) await del(k, this.store);
  }
}
