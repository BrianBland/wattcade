// Drive-In channels: native HLS for Infinite Slop, official embedded players for YouTube.

interface ChannelBase {
  id: string; number: number; name: string;
  url: string;
  credit: { text: string; url: string };
}
export type Channel = ChannelBase & ({ kind: 'hls' } | { kind: 'youtube'; videoId: string });

const SLOP = 'https://infiniteslop.ai';
const CREDIT = { text: 'Infinite Slop by @levelsio + fal.ai', url: SLOP };
/** A tag rerun uses ch=tag and q=<tag>; passing the tag as ch returns the generic feed. */
export const rerunUrl = (tag: string, limit = 50) => `${SLOP}/api/channel?ch=tag&q=${encodeURIComponent(tag)}&limit=${limit}`;
/** Match the site's cache-busting r parameter when fetching/reloading a rerun playlist. */
export function freshPlaylistUrl(url: string, nonce = Date.now().toString(36)): string {
  const fresh = new URL(url);
  if (fresh.pathname === '/api/channel') fresh.searchParams.set('r', nonce);
  return fresh.href;
}

const youtube = (id: string, name: string, videoId: string, credit: string): Omit<ChannelBase, 'number'> & { kind: 'youtube'; videoId: string } => ({
  id, name, kind: 'youtube', videoId, url: `https://www.youtube.com/watch?v=${videoId}`,
  credit: { text: credit, url: `https://www.youtube.com/watch?v=${videoId}` },
});
const LINEUP: Array<Omit<ChannelBase, 'number'> & ({ kind: 'hls' } | { kind: 'youtube'; videoId: string })> = [
  { id: 'live', name: 'LIVE', kind: 'hls', url: `${SLOP}/live/playlist.m3u8`, credit: CREDIT },
  ...(['comedy', 'animals', 'surreal', 'commercial', 'goth', 'meme'] as const).map((id) => ({ id, name: id.toUpperCase(), kind: 'hls' as const, url: rerunUrl(id), credit: CREDIT })),
  youtube('lofi-girl', 'LOFI GIRL', '1-LpQekNa9g', 'Lofi Girl · YouTube'),
  youtube('kittens', 'KITTENS', '-m_nQT62B4Y', 'Kittens · YouTube'),
  youtube('puppies', 'PUPPIES', 'h-Z0wCdD3dI', 'Puppies · YouTube'),
];
export const CHANNELS: readonly Channel[] = LINEUP.map((channel, i) => ({ ...channel, number: i + 1 }));

/** The dial: which channel is on, and which have been marked unavailable after errors (skipped when flipping). */
export interface Dial { id: string; bad: readonly string[] }

export const channelById = (id: string, list: readonly Channel[] = CHANNELS): Channel => {
  const currentId = id === 'ads' ? 'commercial' : id;
  return list.find((c) => c.id === currentId) ?? list[0];
};
/** Restore the last channel; an unknown or missing id falls back to the first. */
export const initialDial = (savedId?: string | null, list: readonly Channel[] = CHANNELS): Dial => ({ id: channelById(savedId ?? '', list).id, bad: [] });

/** Next (+1) or previous (-1) available channel, wrapping. If every other channel is unavailable the dial stays put. */
export function flip(dial: Dial, dir: 1 | -1, list: readonly Channel[] = CHANNELS): Dial {
  const i = Math.max(0, list.findIndex((c) => c.id === dial.id)), n = list.length;
  for (let k = 1; k <= n; k++) {
    const c = list[(((i + dir * k) % n) + n) % n];
    if (!dial.bad.includes(c.id)) return { ...dial, id: c.id };
  }
  return dial;
}
export const markBad = (dial: Dial, id: string): Dial => (dial.bad.includes(id) ? dial : { ...dial, bad: [...dial.bad, id] });
export const clearBad = (dial: Dial): Dial => (dial.bad.length ? { ...dial, bad: [] } : dial);

/** Per-rider persisted state (localStorage `wattcade.drivein.<profileId>`). */
export interface DriveInSaved { on: boolean; ch: string; sound: boolean }
export const DEFAULT_SAVED: DriveInSaved = { on: false, ch: CHANNELS[0].id, sound: false };
export const storageKey = (profileId: string) => `wattcade.drivein.${profileId}`;
export function parseSaved(raw: string | null | undefined): DriveInSaved {
  try {
    const v = JSON.parse(raw ?? 'null') as Partial<DriveInSaved> | null;
    return { on: v?.on === true, ch: channelById(typeof v?.ch === 'string' ? v.ch : '').id, sound: v?.sound === true };
  } catch { return { ...DEFAULT_SAVED }; }
}
