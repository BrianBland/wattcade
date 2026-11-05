import { MAX_STREAM_DURATION_S } from './limits';
import type { SongMeta } from '../library/store';
export type OnlineProvider = 'youtube' | 'soundcloud';
export interface ResolverConfig { url: string; token: string }
import { mediaServerConfig, saveMediaServerConfig } from './config';
export const resolverConfig = mediaServerConfig;
export function setResolverConfig(c: ResolverConfig): void { saveMediaServerConfig({ ...mediaServerConfig(), ...c }); }

export async function resolverRequest(config: ResolverConfig, route: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  const base = new URL(config.url.replace(/\/$/, '') + '/', location.origin);
  if (!['https:', 'http:'].includes(base.protocol)) throw new Error('Use an HTTP or HTTPS resolver URL.');
  const r = await fetch(new URL(route, base), { method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}) },
    body: JSON.stringify(body) });
  if (!r.ok) {
    let error = `Audio resolver failed (${r.status})`;
    try { error = (await r.json()).error ?? error; } catch { /* proxy returned HTML */ }
    throw Object.assign(new Error(error), { status: r.status });
  }
  return r;
}
export async function searchOnline(provider: OnlineProvider, query: string, config = resolverConfig(), signal?: AbortSignal): Promise<SongMeta[]> {
  let r: Response | undefined;
  for (let attempt = 0; ; attempt++) {
    try { r = await resolverRequest(config, 'search', { provider, query }, signal); break; }
    catch (e) {
      if ((e as { status?: number }).status !== 429 || attempt >= 3 || signal?.aborted) throw e;
      await new Promise<void>((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(new DOMException('Search cancelled', 'AbortError')); };
        const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, 250 * (attempt + 1));
        signal?.addEventListener('abort', abort, { once: true });
      });
    }
  }
  const body = await r.json();
  if (!Array.isArray(body.tracks)) throw new Error('Invalid audio resolver response.');
  return body.tracks.map((t: any) => {
    if (t.source !== provider || !String(t.id).startsWith(`${provider}:`) || typeof t.title !== 'string'
        || typeof t.durationS !== 'number' || !Number.isFinite(t.durationS) || t.durationS <= 0 || t.durationS > MAX_STREAM_DURATION_S
        || typeof t.artist !== 'string' || typeof t.pageUrl !== 'string' || !t.pageUrl.startsWith('https://')) throw new Error('Invalid online track.');
    return { id: t.id, source: t.source, title: t.title, artist: t.artist, durationS: t.durationS,
      sourceUrl: t.pageUrl, addedAt: 0, status: 'remote', credit: { text: `via ${provider === 'youtube' ? 'YouTube' : 'SoundCloud'}`, url: t.pageUrl } };
  });
}
export async function loadOnlineAudio(song: SongMeta): Promise<Blob> {
  if (!song.sourceUrl) throw new Error('Online song is missing its source link.');
  const r = await resolverRequest(resolverConfig(), 'audio', { url: song.sourceUrl });
  if (!r.headers.get('Content-Type')?.startsWith('audio/')) throw new Error('Resolver did not return audio.');
  return r.blob();
}

export async function checkMediaServer(config = mediaServerConfig()): Promise<{ name: string; range: boolean }> {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10000);
  try {
    const r = await resolverRequest(config, 'health', {}, controller.signal), data = await r.json();
    if (data.api !== 2 || data.capabilities?.ranges !== true) throw new Error('Media server needs an update (ranged audio API v2).');
    return { name: data.name, range: true };
  } finally { clearTimeout(timer); }
}
export async function loadAudioRange(song: SongMeta, startS: number, durationS: number, config = mediaServerConfig(), signal?: AbortSignal): Promise<ArrayBuffer> {
  if (!config.enabled || !song.sourceUrl) throw new Error('Connect a media server to load online music.');
  const r = await resolverRequest(config, 'chunk', { url: song.sourceUrl, startS, durationS }, signal);
  if (!r.headers.get('Content-Type')?.startsWith('audio/wav')) throw new Error('Media server did not return a WAV audio range.');
  return r.arrayBuffer();
}
