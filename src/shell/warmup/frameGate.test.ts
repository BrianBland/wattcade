import { expect, it } from 'vitest';
import { FrameGate } from './frameGate';

it.each([60, 120, 144])('draws at 60 Hz on a %i Hz display without drift', (refresh) => {
  const gate = new FrameGate();
  let frames = 0;
  for (let i = 0; i < refresh * 10; i++) if (gate.ready(100 + i * 1000 / refresh)) frames++;
  expect(frames).toBe(600);
});

it('renders immediately after a long gap without a burst of catch-up frames', () => {
  const gate = new FrameGate();
  expect(gate.ready(100)).toBe(true);
  expect(gate.ready(105)).toBe(false);
  expect(gate.ready(5000)).toBe(true);
  expect(gate.ready(5001)).toBe(false);
  expect(gate.ready(5000 + 1000 / 60)).toBe(true);
});
