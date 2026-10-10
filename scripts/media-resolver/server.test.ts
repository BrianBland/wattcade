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
it('serves the playlist route with choice, validation and protection', async () => {
  const seen: unknown[] = [];
  const { playlist: real } = await import('./playlist');
  const server = resolverServer({ origin: 'http://localhost:5173', token: 't',
    playlist: async (url, opts) => { seen.push(opts?.limit); if (url.includes('fail')) throw new Error('boom'); return real(url, opts, async () => JSON.stringify({ title: 'P', entries: [{ id: 'abcdefghijk', title: 'S', duration: 60 }] })); } });
  servers.push(server); await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const headers = { Origin: 'http://localhost:5173', Authorization: 'Bearer t', 'Content-Type': 'application/json' };
  const post = (body: unknown, h: Record<string, string> = headers) => fetch(base + '/playlist', { method: 'POST', headers: h, body: JSON.stringify(body) });
  const list = 'PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf';
  expect((await post({ url: '' }, { ...headers, Authorization: 'x' })).status).toBe(401);
  expect((await post({ url: '' }, { ...headers, Origin: 'https://evil.test' })).status).toBe(403);
  const ok = await post({ url: `https://www.youtube.com/playlist?list=${list}`, limit: 10 });
  expect(ok.status).toBe(200); expect(await ok.json()).toMatchObject({ playlist: { id: list }, tracks: [{ id: 'youtube:abcdefghijk', index: 1 }] });
  const mixed = await post({ url: `https://www.youtube.com/watch?v=abcdefghijk&list=${list}` });
  expect(mixed.status).toBe(409); expect(await mixed.json()).toMatchObject({ code: 'choice-required' });
  expect((await post({ url: `https://www.youtube.com/watch?v=abcdefghijk&list=${list}`, choice: 'playlist' })).status).toBe(200);
  for (const bad of [{}, { url: 5 }, { url: 'x'.repeat(3000) }, { url: 'https://x', choice: 'all' }, { url: 'https://x', limit: '5' }])
    expect((await post(bad)).status).toBe(400);
  expect(await (await post({ url: `https://www.youtube.com/playlist?list=${list}&fail` })).json()).toEqual({ error: 'boom' });
  expect(await (await fetch(base + '/health', { method: 'POST', headers, body: '{}' })).json()).toMatchObject({ api: 2, capabilities: { playlists: true }, maxPlaylistItems: 100 });
  expect(seen).toContain(10);
});
