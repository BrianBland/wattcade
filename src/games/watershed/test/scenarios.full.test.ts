import { describe } from 'vitest';
import { scenarioTests } from './scenarioRun';

// The 46-min autopilot ride (incl. the one-ride achievement checks): ~95 s in tsx, ~140 s under vitest locally.
describe('watershed scenario: full ride', () => { scenarioTests(['full ride'], 600_000); });
