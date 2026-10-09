export interface MediaServerConfig { enabled: boolean; url: string; token: string; bufferS: number }
const KEY = 'wattcade.media.server';
const defaults: MediaServerConfig = { enabled: false, url: '/media-resolver', token: '', bufferS: 60 };
const listeners = new Set<() => void>();
export function mediaServerConfig(): MediaServerConfig {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    const token = sessionStorage.getItem(`${KEY}.token`) ?? '';
    return { ...defaults, ...saved, enabled: saved.enabled === true, token, bufferS: Math.max(60, Math.min(180, Number(saved.bufferS) || 60)) };
  } catch { return { ...defaults }; }
}
export function saveMediaServerConfig(c: MediaServerConfig): void {
  const { token, ...saved } = c;
  localStorage.setItem(KEY, JSON.stringify(saved)); sessionStorage.setItem(`${KEY}.token`, token);
  for (const cb of listeners) cb();
}
export function subscribeMediaServer(cb: () => void): () => void { listeners.add(cb); return () => { listeners.delete(cb); }; }
