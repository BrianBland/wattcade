import { MAX_STREAM_DURATION_S } from '../../src/media/online/limits';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type Provider = 'youtube' | 'soundcloud';
export interface OnlineTrack { id: string; source: Provider; title: string; artist: string; durationS: number; pageUrl: string }
const MAX_DURATION = 1800, MAX_BYTES = 64 * 1024 * 1024;

/** Accept individual public track pages only; never arbitrary fetch destinations. */
export function trackUrl(value: string): { provider: Provider; url: string } {
  let u: URL;
  try { u = new URL(value); } catch { throw new Error('Enter a YouTube or SoundCloud track URL.'); }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) throw new Error('Use an HTTPS track URL.');
  const h = u.hostname.toLowerCase();
  if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'].includes(h)) {
    const id = h === 'youtu.be' ? u.pathname.slice(1) : u.pathname === '/watch' ? u.searchParams.get('v') : /^\/shorts\/([^/]+)$/.exec(u.pathname)?.[1];
    if (!id || !/^[\w-]{11}$/.test(id)) throw new Error('Use an individual YouTube video link.');
    return { provider: 'youtube', url: `https://www.youtube.com/watch?v=${id}` };
  }
  if (['soundcloud.com', 'www.soundcloud.com'].includes(h) && /^\/[^/]+\/[^/]+\/?$/.test(u.pathname)
      && !/^\/(discover|you|search|charts|stations)\//.test(u.pathname) && !/\/sets\/?$/.test(u.pathname)) {
    return { provider: 'soundcloud', url: `https://soundcloud.com${u.pathname.replace(/\/$/, '')}` };
  }
  throw new Error('Only individual YouTube and SoundCloud track links are supported.');
}

export type TrackProblem = 'invalid' | 'live' | 'drm' | 'missing-duration' | 'too-long';
const pageUrl = (t: Record<string, any>, provider: Provider) => provider === 'youtube' ? `https://www.youtube.com/watch?v=${t.id}` : t.webpage_url ?? t.url;
export function trackProblem(t: unknown, provider: Provider): TrackProblem | null {
  if (!t || typeof t !== 'object') return 'invalid';
  const info = t as Record<string, any>;
  try {
    if (trackUrl(pageUrl(info, provider)).provider !== provider || !info.id || typeof info.title !== 'string') return 'invalid';
  } catch { return 'invalid'; }
  if (info.is_live || info.live_status === 'is_live' || info.live_status === 'is_upcoming') return 'live';
  if (info.has_drm) return 'drm';
  const duration = Number(info.duration);
  if (!Number.isFinite(duration) || duration <= 0) return 'missing-duration';
  return duration > MAX_STREAM_DURATION_S ? 'too-long' : null;
}
export const problemText: Record<TrackProblem, string> = {
  invalid: 'unsupported or incomplete track information',
  live: 'live or upcoming streams are not supported',
  drm: 'protected audio is not supported',
  'missing-duration': 'the source did not supply a usable track duration',
  'too-long': 'tracks longer than the 12-hour limit are not supported',
};
export function mapTrack(t: Record<string, any>, provider: Provider): OnlineTrack | null {
  if (trackProblem(t, provider)) return null;
  return { id: `${provider}:${t.id}`, source: provider, title: t.title,
    artist: String(t.artist ?? t.uploader ?? t.channel ?? 'Unknown artist'), durationS: Number(t.duration), pageUrl: trackUrl(pageUrl(t, provider)).url };
}

export type RunExtractor = (args: string[], timeoutMs: number, signal?: AbortSignal) => Promise<string>;
const exec = promisify(execFile);
export const runExtractor: RunExtractor = async (args, timeout, signal) => {
  try {
    const result = await exec(process.env.YT_DLP_BIN ?? 'yt-dlp', args, { timeout, signal, maxBuffer: 8 * 1024 * 1024 });
    return result.stdout;
  } catch (e: any) {
    if (e.name === 'AbortError' || signal?.aborted) throw new Error('Extraction was cancelled.');
    if (e.code === 'ENOENT') throw new Error('yt-dlp is missing. Install yt-dlp and ffmpeg on the resolver host.');
    throw new Error(e.killed ? 'Extraction timed out. Try another track.' : 'The source could not be extracted. It may be unavailable, restricted, or need an updated yt-dlp.');
  }
};

export const COMMON = ['--js-runtimes', 'node', '--no-plugin-dirs', '--ignore-config', '--no-warnings', '--no-playlist', '--socket-timeout', '20', '--retries', '1', '--no-progress'];
export async function search(provider: Provider, query: string, run = runExtractor): Promise<OnlineTrack[]> {
  if (!['youtube', 'soundcloud'].includes(provider)) throw new Error('Unknown music source.');
  if (!query.trim() || query.length > 300) throw new Error('Enter a search or track URL (up to 300 characters).');
  const direct = /^https?:\/\//i.test(query.trim()) ? trackUrl(query.trim()) : null;
  if (direct && direct.provider !== provider) throw new Error('Select the source matching that track link.');
  const target = direct?.url ?? `${provider === 'youtube' ? 'ytsearch' : 'scsearch'}10:${query.trim()}`;
  const json = await run([...COMMON, '--dump-single-json', '--skip-download', ...(direct ? [] : ['--flat-playlist']), '--', target], 60000);
  const result = JSON.parse(json);
  const tracks: unknown[] = direct ? [result] : result?.entries ?? [];
  if (!Array.isArray(tracks)) throw new Error('The source returned an invalid search response.');
  const playable = tracks.map((t) => mapTrack(t as Record<string, any>, provider)).filter((t): t is OnlineTrack => !!t);
  if (!playable.length && tracks.length) {
    if (direct) {
      const t = result as Record<string, any>, reason = trackProblem(t, provider)!;
      const length = reason === 'too-long' ? ` (${Math.round(Number(t.duration) / 60)} minutes)` : '';
      throw new Error(`Cannot queue this track${length}: ${problemText[reason]}.`);
    }
    const counts = new Map<TrackProblem, number>();
    for (const t of tracks) { const reason = trackProblem(t, provider)!; counts.set(reason, (counts.get(reason) ?? 0) + 1); }
    const details = [...counts].map(([reason, n]) => `${n}: ${problemText[reason]}`).join('; ');
    throw new Error(`No playable tracks among ${tracks.length} search results. ${details}. Try an individual song or another search.`);
  }
  return playable;
}

export async function extractAudio(value: string, run = runExtractor): Promise<Buffer> {
  const { url } = trackUrl(value);
  const dir = await mkdtemp(join(tmpdir(), 'cadenza-audio-'));
  try {
    await run([...COMMON, '--max-filesize', String(MAX_BYTES), '--match-filters', `duration <= ${MAX_DURATION} & !is_live`,
      '-f', 'bestaudio/best', '-x', '--audio-format', 'mp3', '--audio-quality', '192K',
      '-o', join(dir, 'track.%(ext)s'), '--', url], 180000);
    const files = await readdir(dir);
    if (!files.includes('track.mp3')) throw new Error('No audio produced. Live streams and tracks over 30 minutes are unsupported.');
    const audio = await readFile(join(dir, 'track.mp3'));
    if (!audio.length || audio.length > MAX_BYTES) throw new Error('Extracted audio exceeds the 64 MB limit.');
    return audio;
  } finally { await rm(dir, { recursive: true, force: true }); }
}

/** Download only the requested window; yt-dlp delegates range cutting to native ffmpeg. */
export async function extractRange(value: string, startS: number, durationS: number, run = runExtractor, signal?: AbortSignal): Promise<Buffer> {
  const { url } = trackUrl(value);
  if (!Number.isFinite(startS) || !Number.isFinite(durationS) || startS < 0 || startS >= MAX_STREAM_DURATION_S || durationS <= 0 || durationS > 40 || startS + durationS > MAX_STREAM_DURATION_S + 4)
    throw new Error('Audio ranges must be between 0 and 12 hours and at most 40 seconds long.');
  const dir = await mkdtemp(join(tmpdir(), 'cadenza-range-'));
  try {
    await run([...COMMON, '--match-filters', `duration <= ${MAX_STREAM_DURATION_S} & !is_live`,
      '-f', 'bestaudio/best', '--force-keyframes-at-cuts', '--download-sections', `*${startS}-${startS + durationS}`,
      '-x', '--audio-format', 'wav', '--postprocessor-args', 'ExtractAudio+ffmpeg_o:-ar 44100 -ac 2',
      '-o', join(dir, 'track.%(ext)s'), '--', url], 90000, signal);
    const audio = await readFile(join(dir, 'track.wav')).catch(() => { throw new Error('The source did not produce this audio range.'); });
    if (!audio.length || audio.length > MAX_BYTES) throw new Error('Audio range exceeds the output limit.');
    return audio;
  } finally { await rm(dir, { recursive: true, force: true }); }
}
