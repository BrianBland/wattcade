// Vitest setup for every test file.
import { setShellCommitGuard } from '../shell/commitGuard';

// Screen tests press A and click buttons a microtask apart. The shared commit debounce would swallow those, so it is
// off by default here; `src/shell/commitGuard.test.ts` turns it on to test it.
setShellCommitGuard(0);
