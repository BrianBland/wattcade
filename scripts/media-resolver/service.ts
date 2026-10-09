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

export function mapTrack(t: Record<string, any>, provider: Provider): OnlineTrack | null {
  const page = provider === 'youtube' ? `https://www.youtube.com/watch?v=${t.id}` : t.webpage_url ?? t.url;
  try {
    const parsed = trackUrl(page);
    if (parsed.provider !== provider || !t.id || typeof t.title !== 'string' || t.is_live || t.live_status === 'is_live' || t.has_drm) return null;
    const duration = Number(t.duration);
    if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_DURATION) return null;
    return { id: `${provider}:${t.id}`, source: provider, title: t.title,
      artist: String(t.artist ?? t.uploader ?? t.channel ?? 'Unknown artist'), durationS: duration, pageUrl: parsed.url };
  } catch { return null; }
}

export type RunExtractor = (args: string[], timeoutMs: number) => Promise<string>;
const exec = promisify(execFile);
export const runExtractor: RunExtractor = async (args, timeout) => {
  try {
    const result = await exec(process.env.YT_DLP_BIN ?? 'yt-dlp', args, { timeout, maxBuffer: 8 * 1024 * 1024 });
    return result.stdout;
  } catch (e: any) {
    if (e.code === 'ENOENT') throw new Error('yt-dlp is missing. Install yt-dlp and ffmpeg on the resolver host.');
    throw new Error(e.killed ? 'Extraction timed out. Try another track.' : 'The source could not be extracted. It may be unavailable, restricted, or need an updated yt-dlp.');
  }
};

const COMMON = ['--js-runtimes', 'node', '--no-plugin-dirs', '--ignore-config', '--no-warnings', '--no-playlist', '--socket-timeout', '20', '--retries', '1', '--no-progress'];
export async function search(provider: Provider, query: string, run = runExtractor): Promise<OnlineTrack[]> {
  if (!['youtube', 'soundcloud'].includes(provider)) throw new Error('Unknown music source.');
  if (!query.trim() || query.length > 300) throw new Error('Enter a search or track URL (up to 300 characters).');
  const direct = /^https?:\/\//i.test(query.trim()) ? trackUrl(query.trim()) : null;
  if (direct && direct.provider !== provider) throw new Error('Select the source matching that track link.');
  const target = direct?.url ?? `${provider === 'youtube' ? 'ytsearch' : 'scsearch'}10:${query.trim()}`;
  const json = await run([...COMMON, '--dump-single-json', '--skip-download', ...(direct ? [] : ['--flat-playlist']), '--', target], 60000);
  const result = JSON.parse(json);
  const tracks = direct ? [result] : result.entries ?? [];
  return tracks.map((t: Record<string, any>) => mapTrack(t, provider)).filter((t: OnlineTrack | null): t is OnlineTrack => !!t);
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
export async function extractRange(value: string, startS: number, durationS: number, run = runExtractor): Promise<Buffer> {
  const { url } = trackUrl(value);
  if (!Number.isFinite(startS) || !Number.isFinite(durationS) || startS < 0 || startS >= MAX_DURATION || durationS <= 0 || durationS > 40 || startS + durationS > MAX_DURATION + 4)
    throw new Error('Audio ranges must be between 0 and 30 minutes and at most 40 seconds long.');
  const dir = await mkdtemp(join(tmpdir(), 'cadenza-range-'));
  try {
    await run([...COMMON, '--max-filesize', String(MAX_BYTES), '--match-filters', `duration <= ${MAX_DURATION} & !is_live`,
      '-f', 'bestaudio/best', '--force-keyframes-at-cuts', '--download-sections', `*${startS}-${startS + durationS}`,
      '-x', '--audio-format', 'wav', '--postprocessor-args', 'ExtractAudio+ffmpeg_o:-ar 44100 -ac 2',
      '-o', join(dir, 'track.%(ext)s'), '--', url], 90000);
    const audio = await readFile(join(dir, 'track.wav')).catch(() => { throw new Error('The source did not produce this audio range.'); });
    if (!audio.length || audio.length > MAX_BYTES) throw new Error('Audio range exceeds the output limit.');
    return audio;
  } finally { await rm(dir, { recursive: true, force: true }); }
}
