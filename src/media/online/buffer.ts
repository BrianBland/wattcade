/** Enough analyzed music for steady efforts and recovery across song changes. */
export const STREAM_BUFFER_OPTIONS = [120, 180, 240] as const;
export const DEFAULT_STREAM_BUFFER_S = 180;
export const STREAM_PAUSE_LEAD_S = 90;
export const STREAM_RESUME_LEAD_S = 120;

export function streamBufferS(value: unknown): number {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0
    ? Math.max(STREAM_BUFFER_OPTIONS[0], Math.min(STREAM_BUFFER_OPTIONS.at(-1)!, seconds))
    : DEFAULT_STREAM_BUFFER_S;
}
