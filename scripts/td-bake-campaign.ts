// Bakes Dynamo Defense's campaign maps: npx tsx scripts/td-bake-campaign.ts (rerun when the generator or CAMPAIGN changes).
import { writeFileSync } from 'node:fs';
import { CAMPAIGN } from '../src/games/towerdefense/sim/campaign';
import { generateLevel } from '../src/games/towerdefense/sim/generator';
import { specKey } from '../src/games/towerdefense/sim/baked';

const out: Record<string, unknown> = {};
for (const c of CAMPAIGN) out[specKey(c)] = { ...generateLevel(c.seed, { style: c.roadStyle, ground: c.ground, pads: c.pads }).level, name: c.name };
writeFileSync(new URL('../src/games/towerdefense/sim/campaignLevels.json', import.meta.url), JSON.stringify(out) + '\n');
console.log(`baked ${CAMPAIGN.length} levels`);
