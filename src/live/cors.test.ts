// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { requestCorsFrom } from './client';

it('requests version-origin images with CORS (so canvases stay readable) and leaves other origins alone', () => {
  requestCorsFrom('https://c-01234567-wattcade.example.dev/');
  const art = new Image(); art.src = 'https://c-01234567-wattcade.example.dev/assets/sheet-1.png';
  expect(art.crossOrigin).toBe('anonymous');
  const other = new Image(); other.src = 'https://i.ytimg.com/vi/x/hq.jpg';
  expect(other.crossOrigin).toBeNull();
  const own = new Image(); own.src = '/assets/local.png';
  expect(own.crossOrigin).toBeNull();
  const set = new Image(); set.crossOrigin = 'use-credentials'; set.src = 'https://c-01234567-wattcade.example.dev/a.png';
  expect(set.crossOrigin).toBe('use-credentials');
});
