// The player's free camera for Watershed (DOM-free, unit-tested): pinch to zoom, drag to pan, twist (or right-drag)
// to rotate, double-tap to snap back. It's an offset layered on whatever the auto camera is doing, so the overview,
// the cloud cam and the salmon chase cam all keep working; the renderer eases it home when the scene changes.
import type { V3 } from './camFit';

export const ZOOM_MIN = 0.12, ZOOM_MAX = 2.6;

export interface FreeCamState {
  /** Distance multiplier from the auto camera's target (1 = auto; < 1 closer). */
  zoom: number;
  /** World-space offset of the look-at point on the ground (X, Z). */
  panX: number; panZ: number;
  /** Extra rotation around the vertical axis through the target (radians). */
  yaw: number;
  /** Raise the look-at point by this much (world units): a landmark up on a terrace stays centred. */
  lift: number;
  /** 0 = the auto camera's angle; 1 = a low, three-quarter angle (TILT_ELEV above the horizon). */
  tilt: number;
}

/** Elevation (radians above the horizon) of a fully tilted camera: low enough to see a water wheel's face. */
export const TILT_ELEV = 0.5;

export const freeCamHome = (): FreeCamState => ({ zoom: 1, panX: 0, panZ: 0, yaw: 0, lift: 0, tilt: 0 });
export const freeCamActive = (f: FreeCamState) => Math.abs(f.zoom - 1) > 0.02 || Math.hypot(f.panX, f.panZ) > 0.5 || Math.abs(f.yaw) > 0.02
  || Math.abs(f.lift) > 0.5 || f.tilt > 0.02;

/** Fingers spreading by `factor` (> 1) bring the camera closer. */
export function zoomBy(f: FreeCamState, factor: number): void {
  if (!(factor > 0) || !Number.isFinite(factor)) return;
  f.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, f.zoom / factor));
}

/** Twist: `dAngle` is the change in screen angle (radians, positive = counter-clockwise on screen; a clockwise twist turns the map clockwise). */
export function rotateBy(f: FreeCamState, dAngle: number): void {
  f.yaw += dAngle;
  while (f.yaw > Math.PI) f.yaw -= Math.PI * 2;
  while (f.yaw < -Math.PI) f.yaw += Math.PI * 2;
}

/**
 * Drag the ground under the finger by (dxPx, dyPx) screen pixels, for the final camera at `pos` looking at `tgt`
 * (vertical fov `fovY`, surface `H` px tall). Dragging right moves the land right; dragging down pulls it toward you.
 */
export function panBy(f: FreeCamState, dxPx: number, dyPx: number, pos: V3, tgt: V3, fovY: number, H: number): void {
  const fx = tgt.x - pos.x, fz = tgt.z - pos.z, fl = Math.hypot(fx, fz);
  const dist = Math.hypot(fx, tgt.y - pos.y, fz);
  if (H <= 0 || dist < 1e-6) return;
  // ground forward/right of the view; straight down falls back to "up the screen = −X" (up the valley)
  const gx = fl > 1e-6 ? fx / fl : -1, gz = fl > 1e-6 ? fz / fl : 0;
  const rx = -gz, rz = gx;
  const perPx = (2 * dist * Math.tan(fovY / 2)) / H;
  const sinP = Math.max(0.35, Math.abs(tgt.y - pos.y) / dist);   // screen-up foreshortens on the ground
  const fwd = (dyPx * perPx) / sinP, side = -dxPx * perPx;
  f.panX += rx * side + gx * fwd;
  f.panZ += rz * side + gz * fwd;
}

/**
 * Apply the free camera to the auto camera's pos/tgt (mutates both). The look-at point stays inside `bounds`
 * (widened to include the auto target, so a camera that's legitimately outside, e.g. over the sea, isn't pulled in).
 */
export function applyFreeCam(f: FreeCamState, pos: V3, tgt: V3, bounds?: { x0: number; x1: number; z0: number; z1: number }): void {
  let ox = pos.x - tgt.x, oy = pos.y - tgt.y, oz = pos.z - tgt.z;
  if (f.yaw !== 0) {
    const c = Math.cos(f.yaw), s = Math.sin(f.yaw);
    const rx = ox * c - oz * s, rz = ox * s + oz * c; ox = rx; oz = rz;
  }
  if (f.tilt > 0) {
    // swing the camera down toward a low three-quarter view, keeping its distance and compass bearing
    const hl = Math.hypot(ox, oz), len = Math.hypot(hl, oy), e = Math.atan2(oy, hl);
    const e2 = e + (TILT_ELEV - e) * Math.min(1, f.tilt);
    const hx = hl > 1e-3 ? ox / hl : Math.cos(f.yaw), hz = hl > 1e-3 ? oz / hl : Math.sin(f.yaw);
    ox = Math.cos(e2) * len * hx; oz = Math.cos(e2) * len * hz; oy = Math.sin(e2) * len;
  }
  ox *= f.zoom; oy *= f.zoom; oz *= f.zoom;
  let tx = tgt.x + f.panX, tz = tgt.z + f.panZ;
  if (bounds) {
    const cx = Math.max(Math.min(bounds.x0, tgt.x), Math.min(Math.max(bounds.x1, tgt.x), tx));
    const cz = Math.max(Math.min(bounds.z0, tgt.z), Math.min(Math.max(bounds.z1, tgt.z), tz));
    f.panX += cx - tx; f.panZ += cz - tz; tx = cx; tz = cz;   // don't let the offset wind up past the edge
  }
  tgt.x = tx; tgt.z = tz; tgt.y += f.lift;
  pos.x = tx + ox; pos.y = tgt.y + oy; pos.z = tz + oz;
}

/** Ease the free camera back to the auto camera; returns true once it's home. */
export function easeHome(f: FreeCamState, dt: number, rate = 6): boolean {
  const k = 1 - Math.exp(-dt * rate);
  f.zoom += (1 - f.zoom) * k; f.panX -= f.panX * k; f.panZ -= f.panZ * k; f.yaw -= f.yaw * k; f.lift -= f.lift * k; f.tilt -= f.tilt * k;
  if (freeCamActive(f)) return false;
  Object.assign(f, freeCamHome());
  return true;
}

/** Zoom used when the camera flies to a landmark (fraction of the auto camera's distance). */
export const FOCUS_ZOOM = 0.2;

/**
 * The free-camera state that centres world point `poi` for an auto camera currently looking at `autoTgt`: zoomed in
 * to `zoom` and tilted down to a low angle, so a mill wheel or a dam fills the view.
 */
export function focusState(poi: V3, autoTgt: V3, zoom = FOCUS_ZOOM, tilt = 1): FreeCamState {
  return { zoom: Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom)), panX: poi.x - autoTgt.x, panZ: poi.z - autoTgt.z, yaw: 0, lift: poi.y - autoTgt.y, tilt };
}

/** Ease `f` toward `goal` (a fly-to); returns true once it has arrived. */
export function easeToward(f: FreeCamState, goal: FreeCamState, dt: number, rate = 3): boolean {
  const k = 1 - Math.exp(-dt * rate);
  let dy = goal.yaw - f.yaw;
  while (dy > Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  f.zoom += (goal.zoom - f.zoom) * k; f.panX += (goal.panX - f.panX) * k; f.panZ += (goal.panZ - f.panZ) * k;
  f.yaw += dy * k; f.lift += (goal.lift - f.lift) * k; f.tilt += (goal.tilt - f.tilt) * k;
  return Math.abs(goal.zoom - f.zoom) < 0.01 && Math.hypot(goal.panX - f.panX, goal.panZ - f.panZ) < 0.2 && Math.abs(goal.lift - f.lift) < 0.2;
}

export interface CamView { pos: V3; tgt: V3; fovY: number; H: number }

/**
 * Pointer bookkeeping for the gestures, fed by the renderer's pointer/wheel listeners (screen px, ms).
 * One finger / left mouse: pan. Two fingers: pinch zoom + twist rotate + pan by the midpoint. Right mouse or
 * shift-drag: rotate. Wheel: zoom. Double-tap: `onReset`.
 */
export class FreeCamGestures {
  private pts = new Map<number, { x: number; y: number; rotate: boolean }>();
  private pair: { d: number; a: number; mx: number; my: number } | null = null;
  private tap = { t: -1e9, x: 0, y: 0 };
  private press: { t: number; x: number; y: number; moved: boolean } | null = null;
  /** Set whenever the player moves the camera (the renderer stops easing home). */
  touched = false;

  constructor(private f: FreeCamState, private view: () => CamView, private onReset: () => void) {}

  get active() { return this.pts.size > 0; }

  down(id: number, x: number, y: number, t: number, rotate = false) {
    this.pts.set(id, { x, y, rotate });
    if (this.pts.size === 1) this.press = { t, x, y, moved: false };
    else if (this.press) this.press.moved = true;
    this.pair = this.pairInfo();
  }

  move(id: number, x: number, y: number) {
    const p = this.pts.get(id);
    if (!p) return;
    const dx = x - p.x, dy = y - p.y;
    p.x = x; p.y = y;
    if (this.press && Math.hypot(x - this.press.x, y - this.press.y) > 8) this.press.moved = true;
    if (this.pts.size === 1) {
      if (dx === 0 && dy === 0) return;
      if (p.rotate) rotateBy(this.f, -dx * 0.008);
      else { const v = this.view(); panBy(this.f, dx, dy, v.pos, v.tgt, v.fovY, v.H); }
      this.touched = true;
      return;
    }
    const now = this.pairInfo(), prev = this.pair;
    this.pair = now;
    if (!now || !prev) return;
    if (prev.d > 1 && now.d > 1) zoomBy(this.f, now.d / prev.d);
    let da = now.a - prev.a;
    if (da > Math.PI) da -= Math.PI * 2; else if (da < -Math.PI) da += Math.PI * 2;
    rotateBy(this.f, -da);
    const v = this.view();
    panBy(this.f, now.mx - prev.mx, now.my - prev.my, v.pos, v.tgt, v.fovY, v.H);
    this.touched = true;
  }

  up(id: number, t: number) {
    if (!this.pts.delete(id)) return;
    this.pair = this.pairInfo();
    if (this.pts.size > 0 || !this.press) return;
    const pr = this.press; this.press = null;
    if (pr.moved || t - pr.t > 300) return;
    if (t - this.tap.t < 350 && Math.hypot(pr.x - this.tap.x, pr.y - this.tap.y) < 40) { this.tap.t = -1e9; this.onReset(); return; }
    this.tap = { t, x: pr.x, y: pr.y };
  }

  cancel(id: number) { this.pts.delete(id); this.pair = this.pairInfo(); if (this.pts.size === 0) this.press = null; }

  /** Mouse wheel / trackpad: deltaY > 0 (scroll down) pulls back. */
  wheel(deltaY: number) {
    zoomBy(this.f, Math.exp(-Math.max(-200, Math.min(200, deltaY)) * 0.0025));
    this.touched = true;
  }

  private pairInfo() {
    if (this.pts.size < 2) return null;
    const [a, b] = [...this.pts.values()];
    return { d: Math.hypot(b.x - a.x, b.y - a.y), a: Math.atan2(b.y - a.y, b.x - a.x), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  }
}
