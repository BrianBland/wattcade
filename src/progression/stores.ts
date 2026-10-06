import { createStore, get, set, del, keys, getMany, type UseStore } from 'idb-keyval';
import type { Profile, SessionRecord } from '../contracts';
import { defaultProfile, defaultSettings } from './defaults';
import { migrateProfile, migrateSessionRecord } from '../core/renames';

const MAX_SESSIONS = 200;

export class ProfileStore {
  private store: UseStore;
  constructor(dbName = 'wattcade-profiles') {
    this.store = createStore(dbName, 'kv');
  }
  private norm(p: Profile): Profile {
    const m = migrateProfile(p); // renamed games keep their saves
    return { ...m, settings: { ...defaultSettings(), ...m.settings } };
  }
  async list(): Promise<Profile[]> {
    const ks = (await keys(this.store)).filter((k) => typeof k === 'string' && k.startsWith('p_')) as string[];
    const ps = (await getMany<Profile>(ks, this.store)).filter((p): p is Profile => !!p).map((p) => this.norm(p));
    return ps.sort((a, b) => a.createdAt - b.createdAt);
  }
  async get(id: string): Promise<Profile | undefined> {
    const p = await get<Profile>(id, this.store);
    return p ? this.norm(p) : undefined;
  }
  async create(name: string, init: Partial<Profile> = {}): Promise<Profile> {
    const p: Profile = { ...defaultProfile(name), ...init, name };
    await set(p.id, p, this.store);
    return p;
  }
  async update(p: Profile): Promise<Profile> {
    await set(p.id, p, this.store);
    return p;
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
