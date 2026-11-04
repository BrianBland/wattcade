import { expect, it } from 'vitest';
import { NewsTicker } from '../render/ticker';

const measure = (text: string) => text.length * 10;
const long = { id: 1, text: 'The board has reviewed your complaint. It was delicious.' };
const short = { id: 2, text: 'Gerald denies it.' };

it('shows the opening immediately, holds it, then reveals the entire punchline', () => {
  const t = new NewsTicker();
  expect(t.frame(long, 0, 200, measure).offset).toBe(0);
  expect(t.frame(long, 2.5, 200, measure).offset).toBe(0);
  expect(t.frame(long, 1, 200, measure).offset).toBe(-40);
  expect(t.frame(long, 30, 200, measure).offset + measure(long.text)).toBe(200);
});

it('keeps fitting headlines still', () => {
  const t = new NewsTicker();
  expect(t.frame(short, 30, 400, measure)).toEqual({ text: short.text, offset: 0 });
});

it('finishes the current bulletin and end hold before taking only the newest pending headline', () => {
  const t = new NewsTicker(), latest = { id: 3, text: 'Correction: Gerald ate it.' };
  t.frame(long, 0, 200, measure);
  expect(t.frame(short, 3, 200, measure).text).toBe(long.text);
  const travelTime = (measure(long.text) - 200) / 40;
  expect(t.frame(latest, travelTime, 200, measure).text).toBe(long.text);
  expect(t.frame(latest, 3, 200, measure)).toEqual({ text: latest.text, offset: 0 });
});

it('pauses scrolling and replacement, then resumes from the same position', () => {
  const t = new NewsTicker();
  const before = t.frame(long, 4, 200, measure);
  t.paused = true;
  expect(t.frame(short, 100, 200, measure)).toEqual(before);
  t.paused = false;
  expect(t.frame(short, 1, 200, measure).offset).toBe(before.offset - 40);
});

it('restarts the reading window after resizing or starting a fresh session', () => {
  const t = new NewsTicker();
  t.frame(long, 10, 200, measure);
  expect(t.frame(long, 0, 100, measure).offset).toBe(0);
  expect(t.frame({ id: 0, text: 'A fresh box.' }, 0, 100, measure).text).toBe('A fresh box.');
});
