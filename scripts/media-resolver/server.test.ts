import { afterEach, expect, it } from 'vitest';
import { resolverServer } from './server';
import type { AddressInfo } from 'node:net';
const servers: ReturnType<typeof resolverServer>[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r())))); });
it('serves browser-search and audio requests with origin/token protection and useful errors', async () => {
  let extracted = 0;
  const server = resolverServer({ origin: 'http://localhost:5173', token: 'test-token', search: async () => [],
    extractRange: async (url, start, duration) => { expect(url).toContain('youtu.be'); expect([start, duration]).toEqual([28, 34]); return Buffer.from('WAV'); },
    extractAudio: async () => { extracted++; return Buffer.from('audio'); } });
  servers.push(server); await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const headers = { Origin: 'http://localhost:5173', Authorization: 'Bearer test-token', 'Content-Type': 'application/json' };
  expect((await fetch(base + '/audio', { method: 'OPTIONS', headers })).status).toBe(204);
  expect((await fetch(base + '/search', { method: 'POST', headers: { ...headers, Origin: 'https://evil.test' }, body: '{}' })).status).toBe(403);
  expect((await fetch(base + '/audio', { method: 'POST', headers: { ...headers, Authorization: 'wrong' }, body: '{}' })).status).toBe(401);
  const search = await fetch(base + '/search', { method: 'POST', headers, body: JSON.stringify({ provider: 'youtube', query: 'test' }) });
  expect(await search.json()).toEqual({ tracks: [] });
  expect(search.headers.get('Access-Control-Allow-Origin')).toBe(headers.Origin);
  const audio = await fetch(base + '/audio', { method: 'POST', headers, body: JSON.stringify({ url: 'https://youtu.be/BaW_jenozKc' }) });
  expect(audio.headers.get('Content-Type')).toBe('audio/mpeg'); expect(await audio.text()).toBe('audio');
  expect(audio.headers.get('Cache-Control')).toBe('no-store');
  expect((await fetch(base + '/audio', { method: 'POST', headers, body: '{}' })).status).toBe(400);
  expect(extracted).toBe(1);
  const health = await fetch(base + '/health', { method: 'POST', headers, body: '{}' });
  expect(await health.json()).toMatchObject({ api: 2, capabilities: { ranges: true } });
  const chunk = await fetch(base + '/chunk', { method: 'POST', headers, body: JSON.stringify({ url: 'https://youtu.be/BaW_jenozKc', startS: 28, durationS: 34 }) });
  expect(chunk.headers.get('Content-Type')).toBe('audio/wav'); expect(await chunk.text()).toBe('WAV');
  expect((await fetch(base + '/chunk', { method: 'POST', headers, body: JSON.stringify({ url: 'https://youtu.be/BaW_jenozKc' }) })).status).toBe(400);
});
