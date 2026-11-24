import { expect, it } from 'vitest';
import { NewsTicker, TICKER_SPEED } from '../render/ticker';

const measure = (text: string) => text.length * 10;
const long = { id: 1, text: 'The board has reviewed your complaint. It was delicious.' };
const short = { id: 2, text: 'Gerald denies it.' };

it('enters from the right edge and crawls left at a steady speed', () => {
  const t = new NewsTicker();
  expect(t.frame(long, 0, 200, measure).offset).toBe(200);
  expect(t.frame(long, 1, 200, measure).offset).toBe(200 - TICKER_SPEED);
  expect(t.frame(long, 1, 200, measure).offset).toBe(200 - TICKER_SPEED * 2);
});

it('side-scrolls short headlines too, then loops them when nothing new arrives', () => {
  const t = new NewsTicker();
  t.frame(short, 0, 400, measure);
  expect(t.frame(short, 2, 400, measure).offset).toBe(400 - TICKER_SPEED * 2);
  const lap = (400 + measure(short.text)) / TICKER_SPEED;
  expect(t.frame(short, lap, 400, measure)).toEqual({ text: short.text, offset: 400 });
});

it('finishes the current crawl before taking only the newest pending headline', () => {
  const t = new NewsTicker(), latest = { id: 3, text: 'Correction: Gerald ate it.' };
  t.frame(long, 0, 200, measure);
  expect(t.frame(short, 3, 200, measure).text).toBe(long.text);
  const rest = (200 + measure(long.text)) / TICKER_SPEED - 3;
  expect(t.frame(latest, rest - 0.1, 200, measure).text).toBe(long.text);
  expect(t.frame(latest, 0.2, 200, measure)).toEqual({ text: latest.text, offset: 200 });
});

it('pauses in place, then resumes from the same position', () => {
  const t = new NewsTicker();
  t.frame(long, 0, 200, measure);
  const before = t.frame(long, 2, 200, measure);
  t.paused = true;
  expect(t.frame(short, 100, 200, measure)).toEqual(before);
  t.paused = false;
  expect(t.frame(short, 1, 200, measure).offset).toBe(before.offset - TICKER_SPEED);
});

it('clamps to a narrower strip and restarts for a fresh session', () => {
  const t = new NewsTicker();
  t.frame(long, 0, 400, measure);
  expect(t.frame(long, 0, 100, measure).offset).toBe(100);
  expect(t.frame({ id: 0, text: 'A fresh box.' }, 0, 100, measure)).toEqual({ text: 'A fresh box.', offset: 100 });
});
