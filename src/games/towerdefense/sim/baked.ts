import type { LevelSpec } from './campaign';
import type { TdLevel } from './level';
import BAKED_JSON from './campaignLevels.json';

/**
 * The campaign's maps, generated ahead of time (`npx tsx scripts/td-bake-campaign.ts`). Generating a map takes up
 * to a few seconds, too long for the level select's previews or a level start, so the campaign ships its maps.
 * Keys pin the spec; a spec without a baked map (Quick Ride, or a changed campaign) is generated as before.
 */
export const specKey = (spec: Pick<LevelSpec, 'seed' | 'roadStyle' | 'ground' | 'pads'>) =>
  `${spec.seed}|${spec.roadStyle}|${spec.ground}|${spec.pads}`;
export const BAKED_LEVELS = BAKED_JSON as unknown as Readonly<Record<string, TdLevel>>;
