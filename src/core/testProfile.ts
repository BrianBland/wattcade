import type { Profile } from '../contracts';

/** Default headless/test profile (FTP 200, maxHr 185, 75 kg). */
export function testProfile(over: Partial<Profile> = {}): Profile {
  return {
    id: 'test', name: 'Test', color: '#4af', ftp: 200, maxHr: 185, weightKg: 75,
    xp: 0, level: 1, achievements: [],
    lifetime: { kj: 0, seconds: 0, sessions: 0, sprints: 0 },
    gameData: {}, lastPlayed: {}, createdAt: 0,
    settings: {
      difficulty: 1, zoneSource: 'auto', aimMode: 'rotate', paddleDeadzone: 15,
      paddleInvertR: false, maxGradePct: 12, ergCapFtpFraction: 1.5,
    },
    ...over,
  };
}
