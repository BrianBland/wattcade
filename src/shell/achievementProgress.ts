import type { Profile } from '../contracts';

/**
 * Progress toward the lifetime-style achievements the shell can measure from the profile (0..1 plus a label).
 * Per-session achievements (one-ride feats) return null: they're all-or-nothing.
 */
export function achievementProgress(id: string, p: Profile): { frac: number; label: string } | null {
  const pct = (n: number, of: number, unit = '') => ({ frac: Math.min(1, n / of), label: `${Math.min(of, Math.floor(n))}/${of}${unit}` });
  switch (id) {
    case 'kilojoule_1000': return pct(p.lifetime.kj, 1000, ' kJ');
    case 'triple_threat': { const played = ['dungeon', 'lighthouse', 'towerdefense'].filter((g) => p.lastPlayed[g] != null).length; return pct(played, 3, ' games'); }
    case 'storm_chaser': return pct(Number((p.gameData['_progression'] as { stormsWeathered?: number } | undefined)?.stormsWeathered ?? 0), 3, ' storms');
    case 'first_ride': return pct(p.lifetime.sessions, 1, ' ride');
    default: return null;
  }
}
