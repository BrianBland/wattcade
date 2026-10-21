import { DEFAULT_STREAM_BUFFER_S, streamBufferS } from './buffer';

export interface MediaServerConfig { enabled: boolean; url: string; token: string; bufferS: number }
const KEY = 'wattcade.media.server';
const defaults: MediaServerConfig = { enabled: false, url: '/media-resolver', token: '', bufferS: DEFAULT_STREAM_BUFFER_S };
const listeners = new Set<() => void>();
export function mediaServerConfig(): MediaServerConfig {
  let saved: Partial<MediaServerConfig> = {};
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) saved = parsed;
  } catch { /* Restore any legacy token independently of settings. */ }
  let token = typeof saved.token === 'string' ? saved.token : '';
  if (typeof saved.token !== 'string') {
    try { token = sessionStorage.getItem(`${KEY}.token`) ?? ''; } catch { /* Session storage may be unavailable. */ }
  }
  const config = { enabled: saved.enabled === true, url: typeof saved.url === 'string' ? saved.url : defaults.url,
    token, bufferS: streamBufferS(saved.bufferS) };
  if (typeof saved.token !== 'string' && token) {
    // Preserve credentials from the old tab-only storage before the tab closes.
    try { localStorage.setItem(KEY, JSON.stringify(config)); sessionStorage.removeItem(`${KEY}.token`); }
    catch { /* Keep the legacy token usable if migration cannot be persisted. */ }
  }
  return config;
}
export function saveMediaServerConfig(c: MediaServerConfig): void {
  localStorage.setItem(KEY, JSON.stringify(c));
  try { sessionStorage.removeItem(`${KEY}.token`); } catch { /* Persistent settings do not require session storage. */ }
  for (const cb of listeners) cb();
}
export function subscribeMediaServer(cb: () => void): () => void { listeners.add(cb); return () => { listeners.delete(cb); }; }
