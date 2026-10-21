import { describe } from 'vitest';
import { scenarioTests } from './scenarioRun';

// 26-min spin ride (~55 s in tsx locally) and the 3-min idle ride.
describe('watershed scenarios: spin, idle', () => { scenarioTests(['spin reaches the sea', 'idle'], 300_000); });
