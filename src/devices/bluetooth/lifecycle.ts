/** One setup/teardown transaction at a time across peripherals; notifications remain concurrent. */
let tail: Promise<unknown> = Promise.resolve();
let nextAttempt = 0;
// A timed-out promise is not native cancellation. Never stack connect() on the same device.
const pendingGatt = new Map<string, Set<Promise<unknown>>>();
async function awaitPreviousGatt(device: BluetoothDevice, signal: AbortSignal): Promise<void> {
  const pending = pendingGatt.get(device.id);
  if (!pending?.size) return;
  const timer = new AbortController();
  const cancel = () => timer.abort();
  signal.addEventListener('abort', cancel, { once: true });
  try {
    await Promise.race([Promise.allSettled([...pending]), pause(5000, timer.signal).then(() => {
      throw new Error('Previous GATT connection is still settling; wait before retrying');
    })]);
    if (signal.aborted) throw new ConnectionCancelled();
  } finally { timer.abort(); signal.removeEventListener('abort', cancel); }
}
const entries: string[] = [];
export function bluetoothLog(message: string): void {
  entries.push(`${new Date().toISOString()} ${message}`);
  if (entries.length > 600) entries.shift();
}
export function bluetoothLogText(): string {
  return `Wattcade Bluetooth log\n${typeof navigator === 'undefined' ? '' : navigator.userAgent}\n${typeof location === 'undefined' ? '' : location.origin}\n${entries.join('\n')}\n`;
}
export function bluetoothError(e: unknown): string {
  return e instanceof Error ? `${e.name}: ${e.message}` : `rejected with ${String(e)} (${typeof e})`;
}
export class ConnectionCancelled extends Error {
  constructor() { super('Connection canceled'); this.name = 'AbortError'; }
}
export function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new ConnectionCancelled()); return; }
    const cancel = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); reject(new ConnectionCancelled()); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', cancel); resolve(); }, ms);
    signal?.addEventListener('abort', cancel, { once: true });
  });
}
export function serializeBluetooth<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  const run = () => { if (signal?.aborted) throw new ConnectionCancelled(); return operation(); };
  const work = tail.then(run, run); tail = work.catch(() => {}); return work;
}
export interface ConnectionOptions { signal?: AbortSignal; beforeConnect?: () => Promise<void> }
export class Attempt {
  readonly id = ++nextAttempt;
  private pending = new Set<Promise<unknown>>();
  valid = true;
  constructor(readonly device: BluetoothDevice, readonly signal: AbortSignal, private report: (s: string) => void) {}
  check(): void { if (!this.valid || this.signal.aborted) throw new ConnectionCancelled(); }
  log(s: string): void { bluetoothLog(`${this.device.name ?? 'BLE'} [${this.device.id}] attempt ${this.id}: ${s}`); }
  async step<T>(name: string, operation: () => Promise<T>, ms = 8000, nativeOperation = true): Promise<T> {
    this.check(); this.report(name); this.log(`${name}: start`);
    const native = Promise.resolve().then(() => { this.check(); return operation(); });
    if (nativeOperation) this.pending.add(native);
    if (name === 'connecting GATT') {
      const pending = pendingGatt.get(this.device.id) ?? new Set<Promise<unknown>>();
      pending.add(native); pendingGatt.set(this.device.id, pending);
      const settled = () => { pending.delete(native); if (!pending.size) pendingGatt.delete(this.device.id); };
      void native.then(settled, settled);
    }
    let finished = false;
    void native.then(() => { this.pending.delete(native); if (finished) this.log(`${name}: late completion`); }, e => { this.pending.delete(native); if (finished) this.log(`${name}: late ${bluetoothError(e)}`); });
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancel: () => void = () => {};
    try {
      const result = await Promise.race([native, new Promise<never>((_, reject) => {
        cancel = () => reject(new ConnectionCancelled());
        this.signal.addEventListener('abort', cancel, { once: true });
        timer = setTimeout(() => reject(new Error(`${name} timed out after ${ms / 1000}s`)), ms);
      })]);
      this.check(); this.log(`${name}: complete`); return result;
    } catch (e) { this.log(`${name}: ${bluetoothError(e)}`); throw e; }
    finally { finished = true; clearTimeout(timer); this.signal.removeEventListener('abort', cancel); }
  }
  async drain(): Promise<void> {
    if (!this.pending.size) return;
    // disconnect() must abort native GATT; bound the wait for bridges that don't settle promptly.
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([Promise.allSettled([...this.pending]), new Promise<void>(resolve => { timer = setTimeout(resolve, 2000); })]);
    clearTimeout(timer);
    if (this.pending.size) this.log('native operation still pending after cancellation grace');
  }
}
export class ConnectionLifecycle {
  private abort = new AbortController();
  private active: Promise<void> | undefined;
  private attempt: Attempt | undefined;
  private ready = false;
  private closed = false;
  private externalCancel = () => { void this.close(); };
  constructor(private device: BluetoothDevice, private cleanup: (closing?: boolean) => void, private options: ConnectionOptions = {}) {
    options.signal?.addEventListener('abort', this.externalCancel, { once: true });
    if (options.signal?.aborted) void this.close();
  }
  disconnected(): void { if (this.attempt) this.attempt.valid = false; }
  get isClosed(): boolean { return this.closed; }
  get isReady(): boolean { return this.ready && !this.closed && !this.active; }
  get canRecover(): boolean { return this.isReady; }
  check(): void { if (this.closed) throw new ConnectionCancelled(); }
  connect(setup: (a: Attempt) => Promise<void>, progress: (s: string) => void = () => {}, retries = 1): Promise<void> {
    if (this.active) return this.active;
    if (this.closed) return Promise.reject(new ConnectionCancelled());
    const work = this.run(setup, progress, retries);
    this.active = work;
    void work.then(() => { this.active = undefined; }, () => { this.active = undefined; });
    return work;
  }
  recover(setup: (a: Attempt) => Promise<void>, progress: (s: string) => void): void {
    if (!this.canRecover) return;
    void this.connect(setup, progress, 3).catch(e => {
      bluetoothLog(`${this.device.name ?? 'BLE'} recovery stopped: ${bluetoothError(e)}`);
      if (!this.closed) progress('Reconnect failed — tap to retry');
    });
  }
  private async run(setup: (a: Attempt) => Promise<void>, progress: (s: string) => void, retries: number): Promise<void> {
    for (let n = 0; ; n++) {
      this.check();
      if (n || this.ready) {
        const seconds = [2, 4, 8, 15][Math.min(this.ready ? n : n - 1, 3)];
        progress(`Waiting ${seconds}s before reconnecting`);
        await pause(seconds * 1000, this.abort.signal);
      }
      const transaction = async () => {
        this.check(); const a = new Attempt(this.device, this.abort.signal, progress); this.attempt = a;
        try { await awaitPreviousGatt(this.device, this.abort.signal); a.check(); await setup(a); a.check(); this.ready = true; }
        catch (e) {
          a.valid = false; this.cleanup();
          try { this.device.gatt?.disconnect(); } catch { /* bridge may already be closed */ }
          await a.drain();
          // Keep other setup transactions out while the native bridge processes cancellation.
          await pause(500);
          throw e;
        } finally { a.valid = false; this.attempt = undefined; }
      };
      const queued = serializeBluetooth(transaction, this.abort.signal);
      try { await queued; return; }
      catch (e) { if (this.closed || n >= retries) throw e; }
    }
  }
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true; this.ready = false; this.abort.abort();
    if (this.attempt) this.attempt.valid = false;
    this.options.signal?.removeEventListener('abort', this.externalCancel);
    this.cleanup(true);
    bluetoothLog(`${this.device.name ?? 'BLE'} [${this.device.id}]: intentional disconnect`);
    // Abort immediately; the active transaction retains the queue during cancellation grace.
    try { this.device.gatt?.disconnect(); } catch { /* already disconnected */ }
  }
}
