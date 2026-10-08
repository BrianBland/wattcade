import type { Profile, ProfileSettings } from '../contracts';
import { RULES_VERSION } from './levels';

export function defaultSettings(): ProfileSettings {
  return {
    difficulty: 1.0,
    zoneSource: 'auto',
    aimMode: 'rotate',
    paddleDeadzone: 15,
    maxGradePct: 12,
    ergCapFtpFraction: 1.5,
  };
}

const COLORS = ['#ff2e93', '#00e5ff', '#b6ff00', '#ffb300', '#a46bff', '#ff5a3c'];

export function newId(prefix = 'p'): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return `${prefix}_${c.randomUUID()}`;
  return `${prefix}_${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`;
}

export function defaultProfile(name = 'Rider'): Profile {
  return {
    id: newId('p'),
    name,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    ftp: 200,
    maxHr: 185,
    weightKg: 75,
    xp: 0,
    level: 1,
    achievements: [],
    lifetime: { kj: 0, seconds: 0, sessions: 0, sprints: 0 },
    gameData: { _progression: { rules: RULES_VERSION } },
    lastPlayed: {},
    settings: defaultSettings(),
    createdAt: Date.now(),
  };
}
