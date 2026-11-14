// What each arcade card clip shows: one moment of the real game on the fake bike, recorded by scripts/capture-cards.ts
// (in CI on deploy, cached per game; see .github/workflows/deploy.yml). Look at a shot with dev/capture.html?game=<id>&<shotQuery>.

/** Page size the renderer is recorded at (CSS px); `crop` is in this space. */
export const STAGE_W = 960, STAGE_H = 540;

export interface CardShot {
  /** Fake-bike script (core SCRIPTS) and the session seed. */
  script: string; seed?: number;
  /** Sim seconds stepped headlessly before recording (the game in full swing). */
  sec: number;
  /** createSim opts (autopilot etc.). */
  opts?: Record<string, unknown>;
  /** Music games: a synthesized queue of this style. */
  media?: 'edm';
  /** [x, y, w, h] in the 960×540 page; keep ~16:9 so the 640×360 clip isn't distorted. Default: the whole page. */
  crop?: [number, number, number, number];
  /** Where in the loop (0..1) the still poster is taken (default 0.5). */
  poster?: number;
}

const AP = { autopilot: true };
export const CARD_SHOTS: Record<string, CardShot> = {
  cadenza: { script: 'target-follow', sec: 52, media: 'edm', opts: AP }, // a sprint section
  hamster: { script: 'z2', sec: 1200, opts: AP },
  watershed: { script: 'cadence-follow', sec: 1500, opts: AP, crop: [96, 100, 768, 432] },
  dungeon: { script: 'sprints', sec: 150, seed: 11, opts: AP },
  lighthouse: { script: 'z2', sec: 900, opts: AP, crop: [210, 110, 680, 383] },
  towerdefense: { script: 'sprints', sec: 418, opts: AP, crop: [152, 0, 656, 369] }, // mid-wave
  starfighter: { script: 'z2', sec: 137, media: 'edm', opts: AP }, // a busy formation, not the level report
  fullsend: { script: 'hook-responsive', sec: 265, opts: { tour: 'quick', autolean: true }, crop: [0, 0, 800, 450] }, // a sprint into a set-piece smash
};

/** The shot's query for dev/capture.html. */
export function shotQuery(s: CardShot): string {
  const q = new URLSearchParams({ script: s.script, sec: String(s.sec), seed: String(s.seed ?? 1), opts: JSON.stringify(s.opts ?? {}) });
  if (s.media) q.set('media', s.media);
  return q.toString();
}
