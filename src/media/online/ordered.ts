/** Two fetch-ahead slots plus the value currently being consumed. Refill before analysis,
 * commit in order, and attach error handlers immediately even for out-of-order failures.
 * The caller owns aborting loads on failure and can stop scheduling while draining a handoff.
 */
export async function orderedPipeline<J, T>(o: {
  next(): J | null;
  load(job: J): Promise<T>;
  consume(job: J, value: T): Promise<void>;
  concurrency: 1 | 2;
  signal: AbortSignal;
  canSchedule?: () => boolean;
}): Promise<void> {
  const pending: Array<{ job: J; result: Promise<{ ok: true; value: T } | { ok: false; error: unknown }> }> = [];
  const fill = () => {
    while (!o.signal.aborted && (o.canSchedule?.() ?? true) && pending.length < o.concurrency) {
      const job = o.next(); if (!job) break;
      const result = new Promise<T>(resolve => resolve(o.load(job))).then(value => ({ ok: true as const, value }), error => ({ ok: false as const, error }));
      pending.push({ job, result });
    }
  };
  fill();
  while (pending.length && !o.signal.aborted) {
    const current = pending.shift()!, result = await current.result;
    if (o.signal.aborted) return;
    if (!result.ok) throw result.error;
    fill(); // current fetch finished: overlap the next fetch with its analysis
    await o.consume(current.job, result.value);
    fill();
  }
}
