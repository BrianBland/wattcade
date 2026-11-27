import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalizeTuningDefaults, runtimeExports, sharedForwarder } from '../../scripts/live/hashing';
import { SHARED_MODULES } from '../../scripts/live/vitePlugin';
import { SHARED } from './shared';

describe('live build helpers', () => {
  it('blanks tunable defaults only', () => {
    const a = normalizeTuningDefaults(`const x = T.num('gatlingDamage', 30, 0.5, 60); const y = T.bool("auto", true);`);
    const b = normalizeTuningDefaults(`const x = T.num('gatlingDamage', 35, 0.5, 60); const y = T.bool("auto", false);`);
    expect(a).toBe(b);
    expect(normalizeTuningDefaults(`T.num('k', 1, 0, 60)`)).not.toBe(normalizeTuningDefaults(`T.num('k', 1, 0, 61)`));
  });

  it('shares every runtime export of the shared host modules, and they are all functions', () => {
    expect(Object.keys(SHARED).sort()).toEqual(Object.keys(SHARED_MODULES).sort());
    for (const [name, path] of Object.entries(SHARED_MODULES)) {
      const names = runtimeExports(readFileSync(path, 'utf8'));
      const mod = SHARED[name as keyof typeof SHARED] as Record<string, unknown>;
      expect(names.length).toBeGreaterThan(0);
      expect(names.sort()).toEqual(Object.keys(mod).filter((k) => mod[k] !== undefined).sort());
      for (const n of names) expect(typeof mod[n], `${name}.${n}`).toBe('function');
    }
  });

  it('forwards calls to the page copy', async () => {
    const src = sharedForwarder('audio/sfx', ['play']);
    (globalThis as any).__wattcadeShared = { 'audio/sfx': { play: (n: string) => `played ${n}` } };
    const mod = await import(/* @vite-ignore */ `data:text/javascript,${encodeURIComponent(src)}`);
    expect(mod.play('hit')).toBe('played hit');
    delete (globalThis as any).__wattcadeShared;
  });
});
