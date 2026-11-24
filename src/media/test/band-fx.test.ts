import { describe, expect, it } from 'vitest';
import { BandFx, BUTTERWORTH_Q, CROSSOVER_HZ, ECHO, REVERB } from '../player/bandFx';
import { MixEngine } from '../player/engine';

/** Inert Web Audio nodes that remember their type, settings, links and automation. */
interface FakeNode { kind: string; type?: string; out: Set<FakeNode>; gain: FakeParam; frequency: FakeParam; Q: FakeParam; delayTime: FakeParam; connect(n: FakeNode): FakeNode; disconnect(n?: FakeNode): void }
interface FakeParam { value: number; targets: Array<[number, number, number]>; cancelScheduledValues(): void; setValueAtTime(): void; linearRampToValueAtTime(): void; setTargetAtTime(v: number, t: number, tau: number): void }
function fakeContext() {
  const nodes: FakeNode[] = [];
  const param = (): FakeParam => ({ value: 0, targets: [], cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime() {}, setTargetAtTime(v, t, tau) { this.value = v; this.targets.push([v, t, tau]); } });
  const node = (kind: string) => () => {
    const n: FakeNode = { kind, out: new Set(), gain: param(), frequency: param(), Q: param(), delayTime: param(),
      connect(x) { n.out.add(x); return x; }, disconnect(x) { if (x) n.out.delete(x); else n.out.clear(); } };
    if (kind === 'gain') n.gain.value = 1;
    nodes.push(n); return n;
  };
  const ctx = { currentTime: 0, state: 'running', baseLatency: 0, sampleRate: 48000, destination: node('destination')(),
    createGain: node('gain'), createBiquadFilter: node('biquad'), createDelay: node('delay'), close: async () => {} };
  return { ctx, nodes };
}
/** Every node reachable from `from`. */
const reach = (from: FakeNode, seen = new Set<FakeNode>()) => { if (seen.has(from)) return seen; seen.add(from); for (const n of from.out) reach(n, seen); return seen; };

/** Complex response of a Web Audio biquad at f Hz, as the spec defines it (lowpass / highpass Q in dB, allpass Q linear). */
function biquad(type: 'lowpass' | 'highpass' | 'allpass', f0: number, f: number, sr = 48000): [number, number] {
  const Q = type === 'allpass' ? BUTTERWORTH_Q.allpass : 10 ** (BUTTERWORTH_Q.pass / 20);
  const w0 = (2 * Math.PI * f0) / sr, c = Math.cos(w0), al = Math.sin(w0) / (2 * Q);
  const [b0, b1, b2] = type === 'lowpass' ? [(1 - c) / 2, 1 - c, (1 - c) / 2] : type === 'highpass' ? [(1 + c) / 2, -(1 + c), (1 + c) / 2] : [1 - al, -2 * c, 1 + al];
  const [a0, a1, a2] = [1 + al, -2 * c, 1 - al];
  const w = (2 * Math.PI * f) / sr, z1: [number, number] = [Math.cos(w), -Math.sin(w)], z2: [number, number] = [Math.cos(2 * w), -Math.sin(2 * w)];
  const num: [number, number] = [b0 + b1 * z1[0] + b2 * z2[0], b1 * z1[1] + b2 * z2[1]], den: [number, number] = [a0 + a1 * z1[0] + a2 * z2[0], a1 * z1[1] + a2 * z2[1]];
  const d = den[0] ** 2 + den[1] ** 2;
  return [(num[0] * den[0] + num[1] * den[1]) / d, (num[1] * den[0] - num[0] * den[1]) / d];
}
const mul = (...xs: Array<[number, number]>) => xs.reduce<[number, number]>((a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]], [1, 0]);

describe('band FX (MusicFx.bands / flow)', () => {
  it('the crossover sums flat (magnitude within 0.05 dB from 20 Hz to 20 kHz)', () => {
    const [a, b] = CROSSOVER_HZ;
    for (let f = 20; f <= 20000; f *= 1.05) {
      const low = mul(biquad('lowpass', a, f), biquad('lowpass', a, f), biquad('allpass', b, f));
      const hp = mul(biquad('highpass', a, f), biquad('highpass', a, f));
      const mid = mul(hp, biquad('lowpass', b, f), biquad('lowpass', b, f)), high = mul(hp, biquad('highpass', b, f), biquad('highpass', b, f));
      const sum: [number, number] = [low[0] + mid[0] + high[0], low[1] + mid[1] + high[1]];
      expect(Math.abs(20 * Math.log10(Math.hypot(...sum))), `${Math.round(f)} Hz`).toBeLessThan(0.05);
    }
  });

  it('splits LR4 at 150 Hz / 2 kHz with allpass phase matching: 9 Butterworth-Q biquads', () => {
    const { ctx } = fakeContext();
    const fx = new BandFx(ctx as unknown as AudioContext);
    const f = fx.filters as unknown as FakeNode[];
    expect(f).toHaveLength(9);
    const at = (type: string, hz: number) => f.filter((n) => n.type === type && n.frequency.value === hz).length;
    expect([at('lowpass', CROSSOVER_HZ[0]), at('highpass', CROSSOVER_HZ[0]), at('lowpass', CROSSOVER_HZ[1]), at('highpass', CROSSOVER_HZ[1]), at('allpass', CROSSOVER_HZ[1])]).toEqual([2, 2, 2, 2, 1]);
    for (const n of f) expect(n.Q.value).toBeCloseTo(n.type === 'allpass' ? Math.SQRT1_2 : -3.0103, 3);
    // all three bands reach the output; no flow sends until flow > 0
    const out = fx.output as unknown as FakeNode;
    for (const g of fx.gains) expect(reach(g as unknown as FakeNode).has(out)).toBe(true);
    expect(fx.sendsConnected).toBe(false);
  });

  it('smooths band gains (tau 0.04), clamps them and skips tiny changes', () => {
    const { ctx } = fakeContext();
    const fx = new BandFx(ctx as unknown as AudioContext), g = fx.gains as unknown as FakeNode[];
    fx.set([0.5, 1, 9], 0, 0.5);
    expect(g[0].gain.targets).toEqual([[0.5, 0, 0.04]]);
    expect(g[1].gain.targets).toEqual([]);
    expect(g[2].gain.targets.at(-1)![0]).toBe(1.5);
    fx.set([0.503, 1, 1.5], 0, 0.5);
    expect(g[0].gain.targets).toHaveLength(1);
    fx.set([Number.NaN, 1, 1.5], 0, 0.5);
    expect(g[0].gain.targets.at(-1)![0]).toBe(0);
  });

  it('flow wires the echo (mids + highs only) and reverb sends, scales them, and unwires them after the tail', () => {
    const { ctx, nodes } = fakeContext();
    const fx = new BandFx(ctx as unknown as AudioContext), g = fx.gains as unknown as FakeNode[];
    fx.set([1, 1, 1], 1, 0.5);
    expect(fx.sendsConnected).toBe(true);
    const delays = nodes.filter((n) => n.kind === 'delay');
    const echo = delays.find((d) => d.delayTime.targets.length)!;
    expect(echo.delayTime.targets.at(-1)![0]).toBeCloseTo(0.375); // ¾ beat
    expect(delays.filter((d) => (REVERB.delaysMs as readonly number[]).includes(Math.round(d.delayTime.value * 1000)))).toHaveLength(4);
    expect(reach(g[0]).has(echo)).toBe(false); expect(reach(g[1]).has(echo)).toBe(true); expect(reach(g[2]).has(echo)).toBe(true);
    const sends = nodes.filter((n) => n.kind === 'gain' && n.gain.targets.length && n.gain.targets.at(-1)![0] > 0 && !(fx.gains as unknown as FakeNode[]).includes(n));
    expect(sends.map((n) => n.gain.targets.at(-1)![0]).sort()).toEqual([REVERB.send, ECHO.send].sort());
    fx.set([1, 1, 1], 0, 0.5);
    expect(fx.sendsConnected).toBe(true); // the tail rings out first
    ctx.currentTime = 5; fx.set([1, 1, 1], 0, 0.5);
    expect(fx.sendsConnected).toBe(false);
    expect(reach(g[1]).has(echo)).toBe(false);
  });

  it('the engine builds it lazily on the first bands and returns to flat and dry when a game omits them', () => {
    const { ctx } = fakeContext();
    const engine = new MixEngine({ ctx: ctx as unknown as AudioContext, resolveUrl: async () => '' });
    engine.setFx({ degrade: 0.2 });
    expect(engine.bandFxState()).toBeNull();
    engine.setFx({ degrade: 0.2, bands: [0.3, 1, 1], flow: 0.5, beatS: 0.5 });
    expect(engine.bandFxState()).toEqual({ bands: [0.3, 1, 1], sends: true });
    engine.setFx({ degrade: 0 });
    expect(engine.bandFxState()!.bands).toEqual([1, 1, 1]);
    engine.dispose();
  });
});
