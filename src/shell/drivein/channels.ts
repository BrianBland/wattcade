// Drive-In channels (pure data + the dial reducer). v1 is Infinite Slop (https://infiniteslop.ai) over plain HLS, which
// WebKit plays natively in a <video> without CORS. `kind` is a union so YouTube and the media library can join later.

export interface Channel {
  id: string; number: number; name: string;
  kind: 'hls';
  url: string;
  credit: { text: string; url: string };
}

const SLOP = 'https://infiniteslop.ai';
const CREDIT = { text: 'Infinite Slop by @levelsio + fal.ai', url: SLOP };
/** A rerun channel: a VOD playlist; the player reloads it when it ends so the channel never stops. */
export const rerunUrl = (ch: string, limit = 50) => `${SLOP}/api/channel?ch=${encodeURIComponent(ch)}&limit=${limit}`;

const LINEUP: Array<[string, string, string]> = [
  ['live', 'LIVE', `${SLOP}/live/playlist.m3u8`],
  ...(['newest', 'top', 'news', 'comedy', 'music', 'cartoon', 'scifi', 'dance', 'animation', 'horror', 'ads'] as const).map((c) => [c, c === 'scifi' ? 'SCI-FI' : c.toUpperCase(), rerunUrl(c)] as [string, string, string]),
];
// number order from the brief: 1 LIVE, 2 NEWEST, 3 TOP, 4 NEWS, 5 COMEDY, 6 MUSIC, 7 CARTOON, 8 SCI-FI, 9 DANCE, 10 ANIMATION, 11 HORROR, 12 ADS
export const CHANNELS: readonly Channel[] = LINEUP.map(([id, name, url], i) => ({ id, number: i + 1, name, kind: 'hls' as const, url, credit: CREDIT }));

/** The dial: which channel is on, and which have been marked unavailable after errors (skipped when flipping). */
export interface Dial { id: string; bad: readonly string[] }

export const channelById = (id: string, list: readonly Channel[] = CHANNELS): Channel => list.find((c) => c.id === id) ?? list[0];
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
