import { describe } from 'vitest';
import { scenarioTests } from './scenarioRun';

// Campaign levels 4-6 ridden by the autopilot.
describe('watershed scenario: levels 4-6', () => { scenarioTests(['level 4: Breadbasket', 'level 5: Millbrook Flood', 'level 6: Dam Buster'], 600_000); });
