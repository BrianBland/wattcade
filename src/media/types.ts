import type { MediaCaps, MediaOnset, MediaSection, Seconds } from '../contracts';

/** Bump when the analysis output changes so cached analyses are recomputed. */
export const ANALYSIS_VERSION = 1;
/** Sample rate the analysis runs at (mono). */
export const ANALYSIS_SR = 22050;
/** Curve rate for intensity/bands (matches MediaTimeline.hz). */
export const CURVE_HZ = 10;

/** Everything we learn about one song. Plain JSON (cached per file hash). */
export interface SongAnalysis {
  v: number;
  durationS: Seconds;
  bpm: number;
  beats: Seconds[];
  downbeats: Seconds[];
  phrases: Seconds[];
  onsets: MediaOnset[];
  intensity: number[];                    // CURVE_HZ, 0..1
  bands: [number[], number[], number[]];  // CURVE_HZ, 0..1
  sections: MediaSection[];
  key: { name: string; camelot: string; confidence: number };
  /** Coarse spectrogram for previews: `bands` mel bands per column at `hz` columns/s, bytes 0..255 (low band first), base64. */
  spec: { hz: number; bands: number; data: string };
  confidence: 'full' | 'metadata';
}

export interface SongRef {
  id: string;            // stable id: 'local:<sha256>', 'synth:<style>:<seed>', 'jamendo:<id>'
  source: string;        // 'local' | 'synth' | 'jamendo' | 'youtube'
  title: string; artist: string; album?: string; track?: number;
  durationS: Seconds;
  palette?: string[];
  credit?: { text: string; url: string };
}

export interface MediaSourceInfo { id: string; label: string; caps: MediaCaps }

export type QueueMode = 'continuous' | 'automix' | 'crossfade';
