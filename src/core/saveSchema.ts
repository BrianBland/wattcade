import type { GameSaveSchema } from '../contracts';

export class SaveReadError extends Error {
  constructor(public readonly code: 'invalid-data' | 'unsupported-version', message: string) {
    super(message); this.name = 'SaveReadError';
  }
}

export function saveObject(value: unknown = {}, field = 'save'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new SaveReadError('invalid-data', `Invalid ${field}. Your stored progress has been kept.`);
  }
  return value as Record<string, unknown>;
}

export function saveNumber(value: unknown, fallback: number, field: string, max = Number.MAX_SAFE_INTEGER, integer = true): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max || (integer && !Number.isSafeInteger(value))) {
    throw new SaveReadError('invalid-data', `Invalid ${field}. Your stored progress has been kept.`);
  }
  return value;
}

export function saveBoolean(value: unknown, fallback: boolean, field: string): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw new SaveReadError('invalid-data', `Invalid ${field}. Your stored progress has been kept.`);
  return value;
}

export function saveChoice<T extends string>(value: unknown, fallback: T, choices: readonly T[], field: string): T {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !choices.includes(value as T)) throw new SaveReadError('invalid-data', `Invalid ${field}. Your stored progress has been kept.`);
  return value as T;
}

export function saveArray<T>(value: unknown, fallback: readonly unknown[], field: string, parse: (v: unknown, i: number) => T, maxLength = Number.MAX_SAFE_INTEGER): T[] {
  const items = value === undefined ? fallback : value;
  if (!Array.isArray(items) || items.length > maxLength) throw new SaveReadError('invalid-data', `Invalid ${field}. Your stored progress has been kept.`);
  return items.map(parse);
}

export function saveString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new SaveReadError('invalid-data', `Invalid ${field}. Your stored progress has been kept.`);
  return value;
}

export function saveLevels(value: unknown, definitions: ReadonlyArray<{ id: string; max: number }>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [id, level] of Object.entries(saveObject(value, 'upgrades'))) {
    const def = definitions.find((d) => d.id === id);
    if (!def) throw new SaveReadError('invalid-data', 'Unknown upgrade in save. Your stored progress has been kept.');
    result[id] = saveNumber(level, 0, `upgrade ${id}`, def.max);
  }
  return result;
}

/** Versions belong to this schema only. A missing version is the oldest save this game still reads. */
export function defineSaveSchema<T>(opts: {
  version: number;
  versionKey?: string;
  /** Oldest payload this reader still accepts when the version field is absent. Defaults to 1. */
  oldest?: number;
  migrations: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>>;
  parse(raw: Record<string, unknown>): T;
}): GameSaveSchema<T> {
  const key = opts.versionKey ?? 'v';
  const oldest = opts.oldest ?? 1;
  return {
    version: opts.version,
    versionKey: key,
    read(raw) {
      if (raw == null) return opts.parse({ [key]: opts.version });
      const original = saveObject(raw);
      let version = saveNumber(original[key], oldest, 'save version');
      if (version > opts.version) throw new SaveReadError('unsupported-version', 'This progress needs a newer version of the game. Your stored progress has been kept.');
      if (version < oldest) throw new SaveReadError('invalid-data', 'Invalid save version. Your stored progress has been kept.');
      let data = structuredClone(original);
      while (version < opts.version) {
        const migrate = opts.migrations[version];
        if (!migrate) throw new SaveReadError('unsupported-version', 'This save format is unsupported. Your stored progress has been kept.');
        data = { ...saveObject(migrate(data)), [key]: ++version };
      }
      return opts.parse(data);
    },
  };
}
