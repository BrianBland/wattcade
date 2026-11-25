// Host modules that live-loaded games share with the page (a version's game chunk forwards to these instead of
// bundling its own: one AudioContext, one sound toggle). The list must match SHARED_MODULES in scripts/live/vitePlugin.ts.
import * as sfx from '../audio/sfx';
import * as voices from '../audio/voices';

export const SHARED = { 'audio/sfx': sfx, 'audio/voices': voices } as const;

export function registerShared(): void {
  (globalThis as { __wattcadeShared?: Record<string, unknown> }).__wattcadeShared = { ...SHARED };
}
