// Per-step timeouts + one whole-setup retry for flaky BLE connects (Bluefy/iOS).
export class StepTimeoutError extends Error {
  constructor(public step: string, public ms: number) { super(`Timed out at step "${step}" after ${Math.round(ms / 1000)}s`); this.name = 'StepTimeoutError'; }
}

export function withTimeout<T>(p: Promise<T>, ms: number, step: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new StepTimeoutError(step, ms)), ms);
    p.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}

/** Runs `attempt`; on failure calls `cleanup` (e.g. gatt.disconnect) and retries once. Throws the second error. */
export async function setupWithRetry(
  attempt: (n: number) => Promise<void>, cleanup: () => void, log: (l: string) => void = () => {},
): Promise<void> {
  try { await attempt(1); return; }
  catch (e) {
    log(`setup attempt 1 failed: ${(e as Error).message}; retrying`);
    try { cleanup(); } catch { /* ignore */ }
  }
  try { await attempt(2); }
  catch (e) {
    log(`setup attempt 2 failed: ${(e as Error).message}`);
    try { cleanup(); } catch { /* ignore */ }
    throw e;
  }
}
