// Manual control/layout harness: keyboard, touch and mixed input on the fake bike.
import { createGameSession, testProfile } from '../src/core';
import { InputHub } from '../src/input';
import { module } from '../src/games/towerdefense';
import type { TdSnapshot } from '../src/games/towerdefense/sim/types';
import { layout } from '../src/games/towerdefense/render/layout';
import { radialLayout } from '../src/games/towerdefense/render/construction';
import { PADS } from '../src/games/towerdefense/sim/defs';

const q = new URLSearchParams(location.search), inset = Number(q.get('inset') ?? 140);
const input = new InputHub(), offKeys = input.attachKeyboard(window);
const session = createGameSession({ game: module, profile: testProfile(), input, fake: { script: q.get('script') ?? 'z2' }, seed: Number(q.get('seed') ?? 1),
  simOpts: { skipGarage: true, autoCrew: q.get('crew') !== '0', actionBot: q.get('actions') === '1' } });
session.step(Math.max(1, Math.round(Number(q.get('sec') ?? 0) * 30)));
const r = await module.loadRenderer(), app = document.getElementById('app')!;
r.mount(app, { profile: session.ctx.profile, send: a => session.sim.receive?.(a), insets: { top: 0, right: 0, bottom: inset, left: 0 } });
const paint = () => r.render(session.sim.snapshot(), session.ctx.bike(), input.state());
const resize = () => { r.resize?.(innerWidth, innerHeight); r.setInsets?.({ top: 0, right: 0, bottom: inset, left: 0 }); paint(); };
document.getElementById('inset')!.style.height = `${inset}px`;
document.getElementById('inset')!.hidden = inset <= 0;
window.addEventListener('resize', resize); resize();
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
    const L = layout(innerWidth, innerHeight, inset), s = session.sim.snapshot() as TdSnapshot, ws = s.workshop;
    const p = ws?.pad == null || ws.pad === 6 ? { x: 50, y: 90 } : PADS[ws.pad];
    return { layout: L,
      pads: PADS.map(p => ({ id: p.id, x: L.field.x + p.x * L.field.s / 100, y: L.field.y + p.y * L.field.s / 100 })),
      menu: ws ? radialLayout(innerWidth, L.UH, { x: L.field.x + p.x * L.field.s / 100, y: L.field.y + p.y * L.field.s / 100 }, ws.rows.length) : null };
  },
  events: () => session.finish().events,
  dispose: () => { cancelAnimationFrame(raf); offKeys(); window.removeEventListener('resize', resize); r.unmount(); session.sim.dispose?.(); },
};
declare global { interface Window { __td: {
  snapshot(): TdSnapshot; advance(seconds: number): void; send(a: unknown): void;
  ui(): { layout: ReturnType<typeof layout>; pads: Array<{ id: number; x: number; y: number }>; menu: ReturnType<typeof radialLayout> | null };
  events(): ReturnType<typeof session.finish>['events']; dispose(): void;
} } }
