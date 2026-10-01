// Serialized control-point writer: one outstanding write, queued writes coalesced per opcode (latest wins).
import { parseControlPointResponse } from './codec';

export interface CpResult { ok: boolean; result: number; coalesced?: boolean; timeout?: boolean; error?: string }
interface Pending { bytes: Uint8Array; resolve: (r: CpResult) => void }

export class ControlPointQueue {
  private pending = new Map<number, Pending>();
  private inflight: { opcode: number; resolve: (r: CpResult) => void; timer: ReturnType<typeof setTimeout> } | null = null;
  private pumping = false;
  constructor(private write: (b: Uint8Array) => Promise<void>, private timeoutMs = 3000) {}

  send(bytes: Uint8Array): Promise<CpResult> {
    return new Promise(resolve => {
      const op = bytes[0];
      const old = this.pending.get(op);
      if (old) old.resolve({ ok: true, result: 1, coalesced: true });
      this.pending.set(op, { bytes, resolve });
      void this.pump();
    });
  }

  /** Feed every control-point indication here. */
  onIndication(data: DataView | Uint8Array): void {
    const r = parseControlPointResponse(data);
    if (!r || !this.inflight || this.inflight.opcode !== r.requestOpcode) return;
    const f = this.inflight; this.inflight = null; clearTimeout(f.timer);
    f.resolve({ ok: r.ok, result: r.result });
    void this.pump();
  }

  /** Fail everything (e.g. on disconnect). */
  reset(error = 'reset'): void {
    if (this.inflight) { clearTimeout(this.inflight.timer); this.inflight.resolve({ ok: false, result: -1, error }); this.inflight = null; }
    for (const p of this.pending.values()) p.resolve({ ok: false, result: -1, error });
    this.pending.clear();
  }

  private async pump(): Promise<void> {
    if (this.pumping || this.inflight) return;
    this.pumping = true;
    try {
      while (!this.inflight && this.pending.size) {
        const [op, p] = this.pending.entries().next().value as [number, Pending];
        this.pending.delete(op);
        const timer = setTimeout(() => {
          if (this.inflight?.opcode === op) { this.inflight = null; p.resolve({ ok: false, result: -1, timeout: true }); void this.pump(); }
        }, this.timeoutMs);
        this.inflight = { opcode: op, resolve: p.resolve, timer };
        try { await this.write(p.bytes); }
        catch (e) {
          if (this.inflight?.opcode === op) { clearTimeout(timer); this.inflight = null; p.resolve({ ok: false, result: -1, error: String(e) }); }
        }
      }
    } finally { this.pumping = false; }
  }
}
