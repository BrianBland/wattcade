/**
 * Penrose Pedals campaign: 9 structured chapters (42 levels) ordered so every mechanic
 * is introduced in a clean single-beat study before being combined.
 * Each item is either a hand-built level id or `'bc:<seed>'` (beat composer).
 */

export interface Chapter {
  name: string;
  /** Short intensity cue shown in the chapter picker. */
  vibe: 'Cruise' | 'Cadence' | 'Effort' | 'Mixed' | 'Finale';
  levels: string[];
}

export const CAMPAIGN: Chapter[] = [
  { name: '1 · First turns', vibe: 'Cruise', levels: ['turntable', 'hub', 'cross', 'crosshub'] },
  { name: '2 · Cadence & flow', vibe: 'Cadence', levels: ['m-lift', 'c-curtain', 'n-belt', 'c-under'] },
  { name: '3 · Effort & tension', vibe: 'Effort', levels: ['seesaw', 'n-clutch', 's-seesaw', 'bc:24'] },
  { name: '4 · Doors & reflections', vibe: 'Cadence', levels: ['n-doors', 'd-peek', 'n-pool', 'n-pool2', 'w-doors', 'p-mirror'] },
  { name: '5 · Tide & wind', vibe: 'Effort', levels: ['m-tide', 'c-tide', 'm-wind', 't-mast', 'w-vane'] },
  { name: '6 · Gravity & architecture', vibe: 'Mixed', levels: ['g-wall', 'n-seam', 'w-seam', 'g-under', 'mobius', 'w-canopy'] },
  { name: '7 · Sight & illusion', vibe: 'Cruise', levels: ['n-friend', 'c-bridge', 'p-turn', 'm-gyro', 'c-towers', 's-behind'] },
  { name: '8 · Everything at once', vibe: 'Mixed', levels: ['w-lanes', 'd-lanes', 'bc:22', 'bc:3', 'bc:13', 'bc:29'] },
  { name: '9 · The Cube', vibe: 'Finale', levels: ['x-cube'] },
];
