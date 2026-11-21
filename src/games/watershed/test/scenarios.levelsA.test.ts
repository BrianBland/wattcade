import { describe } from 'vitest';
import { scenarioTests } from './scenarioRun';

// Campaign levels 1-3 ridden by the autopilot (~20-25 sim min each, ~40 s apiece in tsx).
describe('watershed scenario: levels 1-3', () => { scenarioTests(['level 1: First Spring', 'level 2: The Grist Mill', 'level 3: Beaver Crew'], 600_000); });
