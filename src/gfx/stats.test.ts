import { describe, expect, it } from 'vitest';
import { fpsWindow, gfxStats, noteBackend, noteFrame } from './stats';

describe('gfx stats', () => {
  it('reports fps only once the window has passed', () => {
    expect(fpsWindow(30, 0.5)).toBeNull();
    expect(fpsWindow(60, 1)).toBe(60);
  });
  it('counts frames per second of wall clock and resets on a new backend', () => {
    noteBackend('webgpu');
    for (let i = 0; i <= 45; i++) noteFrame(10 + i / 45); // 45 frames over 1 s
    expect(gfxStats()).toEqual({ backend: 'webgpu', fps: 45 });
    noteBackend('pending');
    expect(gfxStats()).toEqual({ backend: 'pending', fps: 0 });
  });
});
