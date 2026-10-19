// Real shared HUD and renderer, for all-game control/viewport review.
import { h, render } from 'preact';
import { createGameSession, testProfile } from '../src/core';
import { getGame } from '../src/games/registry';
import { synthTimeline } from '../src/media/synth/queue';
import { input } from '../src/shell/services';
import { HudLayer } from '../src/shell/hud/HudLayer';
import { HUD_LAYOUT_EVENT, readHudInsets } from '../src/shell/hud/insets';
import type { GameHud } from '../src/contracts';
import '../src/styles/main.css';

const q = new URLSearchParams(location.search), game = getGame(q.get('game') ?? 'towerdefense')!;
const profile = testProfile(), off = input.attachKeyboard(window);
const session = createGameSession({ game, profile, input, fake: { script: 'z2' }, seed: 3,
  media: { timeline: synthTimeline({ style: 'edm', songs: 1, short: true }) },
  simOpts: { autopilot: q.get('menu') !== '1', skipGarage: q.get('menu') !== '1', autoCrew: true, actionBot: true } });
session.step(Math.max(1, Number(q.get('sec') ?? 5) * 30));
const hud = session.sim.hud?.bind(session.sim); let fixture: GameHud | null = null;
session.sim.hud = () => fixture ?? hud?.() ?? {};
let legendOn = q.get('legend') !== '0', paused = false;
const host = document.querySelector<HTMLElement>('#field')!, probe = document.querySelector<HTMLElement>('#probe')!, hudRoot = document.querySelector<HTMLElement>('#hud')!;
const renderer = await game.loadRenderer();
renderer.mount(host, { profile, send: a => session.sim.receive?.(a), insets: readHudInsets(host, probe), hudControls: true });
const paint = () => renderer.render(session.sim.snapshot(), session.ctx.bike(), input.state());
const resize = () => { renderer.resize?.(innerWidth, innerHeight); renderer.setInsets?.(readHudInsets(host, probe)); paint(); };
const show = () => render(<HudLayer session={session} profile={profile} paused={paused} legendOn={legendOn} fake={q.get('fake') !== '0'} />, hudRoot);
const observer = new ResizeObserver(resize); observer.observe(probe);
window.addEventListener('resize', resize); window.addEventListener(HUD_LAYOUT_EVENT, resize);
show(); resize(); await renderer.ready?.(); paint();
let raf=0, last=performance.now();
if(!q.has('manual')){const tick=(t:number)=>{if(!paused)session.frame(Math.min(.1,(t-last)/1000));last=t;paint();raf=requestAnimationFrame(tick);};raf=requestAnimationFrame(tick);}
(window as any).__hudLive = {
 ready: true, hud: () => session.sim.hud?.(), snapshot: () => session.sim.snapshot(),
 advance: (seconds: number) => { session.step(Math.round(seconds*30)); paint(); },
 legend: (value:boolean) => { legendOn=value; show(); },
 pause: (value:boolean) => { paused=value; show(); },
 fixture: (value:GameHud|null) => { fixture=value; },
 info: () => ({ height: probe.offsetHeight, inset: readHudInsets(host,probe), width:innerWidth, heightPx:innerHeight }),
 dispose: () => { cancelAnimationFrame(raf);observer.disconnect();off();render(null,hudRoot);renderer.unmount();session.sim.dispose?.();window.removeEventListener('resize',resize);window.removeEventListener(HUD_LAYOUT_EVENT,resize); },
};
