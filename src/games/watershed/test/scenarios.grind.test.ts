import { describe } from 'vitest';
import { scenarioTests } from './scenarioRun';

// 26-min grind ride: ~36 s in tsx locally.
describe('watershed scenario: grind', () => { scenarioTests(['grind digs a gorge'], 300_000); });
