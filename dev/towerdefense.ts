// Manual control/layout harness: keyboard, touch and mixed input on the fake bike.
import { createGameSession, testProfile } from '../src/core';
import { h, render } from 'preact';
import { input } from '../src/shell/services';
import { HudLayer } from '../src/shell/hud/HudLayer';
import '../src/styles/main.css';
import { module } from '../src/games/towerdefense';
import type { TdSnapshot } from '../src/games/towerdefense/sim/types';
import { layout } from '../src/games/towerdefense/render/layout';
import { radialLayout } from '../src/games/towerdefense/render/construction';
import { BASE_PAD, BASE_X, BASE_Y, PADS } from '../src/games/towerdefense/sim/defs';
import { toScreen } from '../src/games/towerdefense/render/fieldView';
import { HUD_LAYOUT_EVENT, readHudInsets } from '../src/shell/hud/insets';

const q = new URLSearchParams(location.search), inset = Number(q.get('inset') ?? 140);
const offKeys = input.attachKeyboard(window), useHud = q.get('canvas') !== '1';
let legendOn = q.get('legend') !== '0';
const profile = testProfile(q.get('boss') === '1' ? { gameData: { towerdefense: { v: 2, runs: 1, bestWave: 8, upgrades: { headstart: 2 } } } } : {});
const session = createGameSession({ game: module, profile, input, fake: { script: q.get('script') ?? 'z2' }, seed: Number(q.get('seed') ?? 1),
  simOpts: { skipGarage: true, autoCrew: q.get('crew') !== '0', actionBot: q.get('actions') === '1' } });
if (q.get('boss') === '1') session.tuning.set('towerdefense.railLaserDps', 1); // keep the demo's first opening available for input checks
session.step(Math.max(1, Math.round(Number(q.get('sec') ?? 0) * 30)));
const r = await module.loadRenderer(), app = document.getElementById('field')!;
r.mount(app, { profile: session.ctx.profile, send: a => session.sim.receive?.(a), insets: { top: 0, right: 0, bottom: inset, left: 0 }, hudControls: useHud });
const hudRoot = document.getElementById('hud')!, probe = document.getElementById('probe')!;
const renderHud = () => { if (useHud) render(h(HudLayer, { session, profile, paused: false, legendOn, fake: true }), hudRoot); };
const hudInset = () => useHud ? probe.offsetHeight : inset;
const insets = () => useHud ? readHudInsets(app, probe) : { top: 0, right: 0, bottom: inset, left: 0 };
const paint = () => r.render(session.sim.snapshot(), session.ctx.bike(), input.state());
const resize = () => { r.resize?.(innerWidth, innerHeight); r.setInsets?.(insets()); paint(); };
document.getElementById('inset')!.style.height = `${inset}px`;
document.getElementById('inset')!.hidden = useHud || inset <= 0;
renderHud();
const observer = new ResizeObserver(resize); if (useHud) observer.observe(probe);
window.addEventListener('resize', resize); resize();
window.addEventListener(HUD_LAYOUT_EVENT, resize);
await r.ready?.();
paint();
// ?compose=/path/painting.webp: hide the game canvas and show the single-road painting with real sprites under the
// real status rows and shell HUD, laid out as the new field will be.
const composeBg = q.get('compose');
if (composeBg) {
  const { drawCompose } = await import('./td-paint-guide');
  const gameCanvas = app.querySelector('canvas')!; gameCanvas.style.opacity = '0';
  const own = document.createElement('canvas'); own.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
  app.prepend(own);
  const L = layout(innerWidth, innerHeight, insets(), useHud);
  const k = await drawCompose(own, composeBg, innerWidth, innerHeight, L.field, Math.min(2, devicePixelRatio || 1), composeBg.includes('landscape') ? 'landscape' : 'portrait');
  document.body.dataset.compose = JSON.stringify({ k, hud: hudInset(), top: L.current.y + L.current.h + 12 });
}
let raf = 0;
if (q.get('manual') !== '1') {
  let last = performance.now();
  const frame = (now: number) => { session.frame(Math.min(0.1, (now - last) / 1000)); last = now; paint(); raf = requestAnimationFrame(frame); };
  raf = requestAnimationFrame(frame);
}
window.__td = {
  snapshot: () => session.sim.snapshot() as TdSnapshot,
  advance: (seconds: number) => { session.step(Math.round(seconds * 30)); paint(); },
  send: (a: unknown) => { session.sim.receive?.(a); },
  ui: () => {
    const L = layout(innerWidth, innerHeight, insets(), useHud), s = session.sim.snapshot() as TdSnapshot, ws = s.workshop;
    const p = ws?.pad == null || ws.pad === BASE_PAD ? { x: BASE_X, y: BASE_Y } : PADS[ws.pad];
    return { layout: L, base: toScreen(L.field, { x: BASE_X, y: BASE_Y }),
      pads: PADS.map(p => ({ id: p.id, ...toScreen(L.field, p) })),
      menu: ws ? radialLayout(innerWidth, L.UH, toScreen(L.field, p), ws.rows.length) : null };
  },
  legend: (on: boolean) => { legendOn = on; renderHud(); },
  events: () => session.finish().events,
  dispose: () => { cancelAnimationFrame(raf); observer.disconnect(); render(null, hudRoot); offKeys(); window.removeEventListener('resize', resize); window.removeEventListener(HUD_LAYOUT_EVENT, resize); r.unmount(); session.sim.dispose?.(); },
};
declare global { interface Window { __td: {
  snapshot(): TdSnapshot; advance(seconds: number): void; send(a: unknown): void;
  ui(): { layout: ReturnType<typeof layout>; base: { x: number; y: number }; pads: Array<{ id: number; x: number; y: number }>; menu: ReturnType<typeof radialLayout> | null };
  legend(on: boolean): void;
  events(): ReturnType<typeof session.finish>['events']; dispose(): void;
} } }
