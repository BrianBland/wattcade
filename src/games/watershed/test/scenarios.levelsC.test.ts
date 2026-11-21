import { describe } from 'vitest';
import { scenarioTests } from './scenarioRun';

// Campaign levels 7-8 ridden by the autopilot, and level 2 ridden without steering (it must not clear).
describe('watershed scenario: levels 7-8', () => { scenarioTests(['level 7: Homecoming', 'level 8: The Delta', 'level 2 without steering'], 600_000); });
