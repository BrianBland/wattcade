import { COMMON, mapTrack, problemText, runExtractor, trackProblem, type OnlineTrack, type RunExtractor, type TrackProblem } from './service';

/** Playlist metadata only (no audio). Single-track resolution stays in service.ts with --no-playlist. */
/** Owner decision: imports cap at 100 tracks; raise here (health advertises it). Entries past the cap are dropped and `truncated` is set. */
export const MAX_PLAYLIST_ITEMS = 100, DEFAULT_PLAYLIST_ITEMS = MAX_PLAYLIST_ITEMS;
const YT_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'];

export type PlaylistChoice = 'playlist' | 'track';
export interface PlaylistTarget { listId: string; url: string }
export type SkipReason = TrackProblem | 'unavailable' | 'duplicate';
export interface PlaylistTrack extends OnlineTrack { index: number }
export interface PlaylistSkip { index: number; id?: string; title?: string; reason: SkipReason; message: string }
export interface PlaylistResult {
  playlist: { id: string; title: string; url: string; reportedCount: number | null };
  tracks: PlaylistTrack[]; skipped: PlaylistSkip[]; truncated: boolean; limit: number;
}

export class PlaylistChoiceRequired extends Error {
  readonly code = 'choice-required';
  constructor(readonly videoUrl: string, readonly playlistUrl: string) {
    super('This link points to a video inside a playlist. Choose whether to import the playlist or just this track.');
  }
}

/**
 * Accept public YouTube playlist URLs only. A watch URL carrying both v and list requires an explicit
 * choice; 'track' is rejected here so callers use the single-track route instead.
 */
export function playlistUrl(value: string, choice?: PlaylistChoice): PlaylistTarget {
  let u: URL;
  try { u = new URL(value); } catch { throw new Error('Enter a YouTube playlist URL.'); }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) throw new Error('Use an HTTPS playlist URL.');
  if (!YT_HOSTS.includes(u.hostname.toLowerCase())) throw new Error('Only public YouTube playlist links are supported.');
  const list = u.searchParams.get('list');
  if (u.pathname !== '/playlist' && u.pathname !== '/watch') throw new Error('Use a youtube.com/playlist?list=… link.');
  if (!list || !/^[\w-]{10,64}$/.test(list)) throw new Error('The link has no valid playlist id.');
  // Auto-generated mixes are unbounded radio; WL/LL/liked lists need login.
  if (/^(RD|UL|LL|WL|LM)/.test(list)) throw new Error('Auto-generated mixes and personal lists cannot be imported. Use a public playlist.');
  const url = `https://www.youtube.com/playlist?list=${list}`;
  if (u.pathname === '/watch' && u.searchParams.has('v')) {
    const v = u.searchParams.get('v') ?? '';
    if (choice === 'track') throw new Error('Resolve single tracks with the search route.');
    if (choice !== 'playlist') throw new PlaylistChoiceRequired(`https://www.youtube.com/watch?v=${v}`, url);
  }
  return { listId: list, url };
}

function unavailable(e: Record<string, any>): boolean {
  if (typeof e.title === 'string' && /^\[(deleted|private) video\]$/i.test(e.title.trim())) return true;
  return typeof e.availability === 'string' && !['public', 'unlisted'].includes(e.availability);
}
const skipText: Record<SkipReason, string> = { ...problemText, unavailable: 'deleted, private or unavailable', duplicate: 'already earlier in this playlist' };

export async function playlist(value: string, opts: { choice?: PlaylistChoice; limit?: number; signal?: AbortSignal } = {}, run: RunExtractor = runExtractor): Promise<PlaylistResult> {
  const target = playlistUrl(value, opts.choice);
  const limit = opts.limit ?? DEFAULT_PLAYLIST_ITEMS;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PLAYLIST_ITEMS) throw new Error(`Playlist limit must be 1–${MAX_PLAYLIST_ITEMS} tracks.`);
  const args = [...COMMON.filter((a) => a !== '--no-playlist'), '--yes-playlist', '--flat-playlist', '--dump-single-json', '--skip-download',
    '--playlist-items', `1:${limit + 1}`, '--', target.url];
  let result: any;
  try { result = JSON.parse(await run(args, 60000, opts.signal)); } catch (e) {
    if (e instanceof SyntaxError) throw new Error('The source returned an invalid playlist response.');
    throw e;
  }
  if (!result || typeof result !== 'object' || !Array.isArray(result.entries)) throw new Error('The source returned an invalid playlist response.');
  const entries: unknown[] = result.entries.slice(0, limit);
  const truncated = result.entries.length > limit;
  const seen = new Set<string>(); const tracks: PlaylistTrack[] = []; const skipped: PlaylistSkip[] = [];
  entries.forEach((raw, i) => {
    const index = i + 1;
    const e = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
    const meta = { index, ...(typeof e.id === 'string' ? { id: e.id } : {}), ...(typeof e.title === 'string' ? { title: e.title } : {}) };
    const reason: SkipReason | null = unavailable(e) ? 'unavailable' : trackProblem(e, 'youtube') ?? (seen.has(e.id) ? 'duplicate' : null);
    if (reason) { skipped.push({ ...meta, reason, message: skipText[reason] }); return; }
    seen.add(e.id);
    tracks.push({ ...mapTrack(e, 'youtube')!, index });
  });
  if (!tracks.length) {
    if (!entries.length) throw new Error('This playlist is empty or not public.');
    throw new Error(`No playable tracks among ${entries.length} playlist entries.`);
  }
  const count = Number(result.playlist_count);
  return { playlist: { id: target.listId, title: typeof result.title === 'string' ? result.title : 'YouTube playlist', url: target.url,
    reportedCount: Number.isFinite(count) && count >= 0 ? count : null }, tracks, skipped, truncated, limit };
}
