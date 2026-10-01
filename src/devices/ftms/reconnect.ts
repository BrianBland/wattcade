// Reconnect backoff (SPEC 1.4): 1, 2, 4, 8, then 15 s max.
export function backoffDelayS(attempt: number): number { return [1, 2, 4, 8, 15][Math.min(4, Math.max(0, attempt))]; }

/** Retries `connect` until it succeeds or `cancelled()` is true. Returns true on success. */
export async function reconnectLoop(opts: {
  connect: () => Promise<void>; cancelled: () => boolean;
  sleep?: (ms: number) => Promise<void>; onAttempt?: (n: number, delayS: number) => void;
}): Promise<boolean> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));
  for (let n = 0; !opts.cancelled(); n++) {
    const d = backoffDelayS(n);
    opts.onAttempt?.(n, d);
    await sleep(d * 1000);
    if (opts.cancelled()) return false;
    try { await opts.connect(); return true; } catch { /* retry */ }
  }
  return false;
}
