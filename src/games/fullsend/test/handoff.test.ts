import { describe, expect, it } from 'vitest';
import { handoffMix, handoffRect, HANDOFF, LOBBY_ANCHOR, speedZoom, SPEED_ZOOM } from '../render/handoff';
import { createGameSession, NullInput, testProfile } from '../../../core';
import { module } from '../index';
import type { FullSendSnapshot } from '../sim/sim';

describe('overworld hand-off', () => {
  it('eases from the lobby framing to ours, and back in when the ride ends', () => {
    expect(handoffMix(true, 0, null)).toBe(1);
    expect(handoffMix(true, HANDOFF.holdS + HANDOFF.inS + 0.1, null)).toBe(0);
    expect(handoffMix(false, 0, null)).toBe(0);
    expect(handoffMix(false, 99, HANDOFF.outS)).toBe(1);
  });
  it('at full mix the pixels match the lobby and the rider sits on its anchor; the picture always covers the screen', () => {
    for (const [cw, ch] of [[2048, 1536], [1536, 2048], [1280, 720], [3000, 1400]]) {
      const px = Math.max(2, Math.floor(ch / 300)), bufW = Math.ceil(cw / px), bufH = Math.ceil(ch / px), uh = ch * 0.85;
      const rider = { x: Math.round(bufW * 0.28), y: Math.round((uh / px) * 0.68) };
      for (let f = 0; f <= 1.0001; f += 0.1) for (const zoom of [1, 1.2, SPEED_ZOOM.near]) {
        const r = handoffRect(f, { canvasW: cw, canvasH: ch, px, bufW, bufH, rider, uh, zoom });
        expect(r.x).toBeLessThanOrEqual(0.5); expect(r.y).toBeLessThanOrEqual(0.5);
        expect(r.x + r.w).toBeGreaterThanOrEqual(cw - 0.5); expect(r.y + r.h).toBeGreaterThanOrEqual(ch - 0.5);
      }
      const full = handoffRect(1, { canvasW: cw, canvasH: ch, px, bufW, bufH, rider, uh });
      expect(px * full.z).toBe(Math.max(2, Math.floor(ch / 230)));
      expect(full.x + rider.x * px * full.z).toBeCloseTo(cw * LOBBY_ANCHOR.x, 5);
      expect(full.y + rider.y * px * full.z).toBeCloseTo(uh * LOBBY_ANCHOR.y, 5);
    }
  });
  it('zooms in when slow and out to the widest view flat out, about the rider', () => {
    expect(speedZoom(0)).toBe(SPEED_ZOOM.near); expect(speedZoom(200)).toBe(SPEED_ZOOM.far);
    for (let v = 0; v < 80; v += 5) expect(speedZoom(v + 5)).toBeLessThanOrEqual(speedZoom(v));
    const o = { canvasW: 2048, canvasH: 1536, px: 4, bufW: 512, bufH: 384, rider: { x: 143, y: 200 }, uh: 1300 };
    const r = handoffRect(0, { ...o, zoom: 1.3 });
    expect(r.x + o.rider.x * o.px * r.z).toBeCloseTo(o.rider.x * o.px, 5); // the rider stays put
    expect(r.y + o.rider.y * o.px * r.z).toBeCloseTo(o.rider.y * o.px, 5);
  });
  it('a ride started from the overworld begins in its biome at its speed, and reports where it ends', () => {
    const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'hook-responsive' }, seed: 3,
      simOpts: { tour: 'quick', lobby: { biome: 'snow', v: 8 } } });
    const snap = () => (s.sim as unknown as { snapshot(): FullSendSnapshot }).snapshot();
    expect(snap().biome).toBe('snow'); expect(snap().fromLobby).toBe(true); expect(snap().v).toBe(8);
    expect(snap().hooks.lobbyBiome).toBe('snow');
    for (let i = 0; i < 30 * 600 && snap().phase === 'warmup'; i++) s.step(1);
    expect(snap().biome).not.toBe('snow'); // blended into the first set piece's biome during the warm-up
    const plain = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'hook-responsive' }, seed: 3, simOpts: { tour: 'quick', lobby: { biome: 'nowhere' } } });
    expect((plain.sim as unknown as { snapshot(): FullSendSnapshot }).snapshot().fromLobby).toBe(false);
  });
});
