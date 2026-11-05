// 3D renderer stats for the debug overlay. No three import, so the shell bundle stays three-free.
export type GfxBackend = 'webgpu' | 'webgl2' | 'pending';

const stats = { backend: 'pending' as GfxBackend, fps: 0, frames: 0, since: 0 };

/** Backend in use by the last 3D renderer and its frame rate (wall clock, ~1 s window). `pending` = no 3D game yet. */
export function gfxStats(): { backend: GfxBackend; fps: number } { return { backend: stats.backend, fps: stats.fps }; }

/** Pure fps window: the new fps once `windowS` has passed, else null. */
export function fpsWindow(frames: number, elapsedS: number, windowS = 1): number | null {
  return elapsedS >= windowS ? frames / elapsedS : null;
}

export function noteBackend(b: GfxBackend) { stats.backend = b; stats.frames = 0; stats.since = 0; stats.fps = 0; }
export function noteFrame(nowS: number) {
  if (!stats.since) { stats.since = nowS; return; }
  stats.frames++;
  const fps = fpsWindow(stats.frames, nowS - stats.since);
  if (fps !== null) { stats.fps = fps; stats.frames = 0; stats.since = nowS; }
}
