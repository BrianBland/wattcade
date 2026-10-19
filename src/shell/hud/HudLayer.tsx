import './ribbon.css';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { BikeState, GameHud, Profile, TrainerCommand } from '../../contracts';
import type { SessionLike } from '../types';
import { input } from '../services';
import { useMenuNav } from '../useMenuNav';
import { controlRows } from '../controlGlyphs';
import { Hood, PadKey } from './Pad';
import { buildPad, compactButtons } from './padModel';
import { RideHistory, ZoneWidget, type ZoneView } from './ZoneWidget';
import { FakeBikeHelp } from './FakeBikeHelp';
import { History, boundsFor, effectiveSource, zonePosition, type Bar } from './zoneMath';
import { HUD_LAYOUT_EVENT } from './insets';

interface Frame { bike: BikeState; hud: GameHud; command?: TrainerCommand | null; held: ReadonlySet<any>; paddles: [number, number]; view: ZoneView; bars: Bar[] }
/** One ride history across lobby -> game -> lobby, independent of chart visibility. */
const rideHistory = new History();
function readFrame(session: SessionLike, profile: Profile): Frame {
  const bike = session.ctx.bike() as BikeState, hud = session.sim.hud?.() ?? {};
  const source = effectiveSource(profile.settings.zoneSource, bike.hr5s, hud.targetZone);
  const frac = source === 'hr' ? (bike.hr5s ?? 0) / profile.maxHr : bike.ftpFraction;
  const st = input.state();
  return { bike, hud, command: session.mixer?.command, held: st.held, paddles: [st.paddleL, st.paddleR], view: { pos: zonePosition(frac, boundsFor(source)), source }, bars: rideHistory.bars.slice() };
}

/** Controller-accessible history, opened from the pause menu without adding a gameplay binding. */
export function PauseHistory({ ftp, onClose }: { ftp: number; onClose(): void }) {
  useMenuNav(1, 1, onClose, onClose);
  return <div class="overlay-modal"><section class="modal ride-history-dialog" role="dialog" aria-modal="true" aria-label="Recent effort">
    <h2>Recent effort</h2><p class="dim">Power and heart rate · Last 3 minutes</p>
    <RideHistory bars={rideHistory.bars} ftp={ftp} /><button class="btn" onClick={onClose}>Back</button>
  </section></div>;
}

/** H1: instruments above; directions and left controls | A B Y Z and right controls below. */
export function HudLayer({ session, profile, paused, legendOn, fake, menu }: {
  fake?: boolean; session: SessionLike; profile: Profile; paused: boolean; legendOn: boolean;
  menu?: () => { label: string; onClick: () => void; dim?: boolean };
}) {
  const [f, setF] = useState<Frame>(() => readFrame(session, profile));
  const [panel, setPanel] = useState<'history' | 'controls' | null>(null);
  const [pinned, setPinned] = useState(false);
  const root = useRef<HTMLDivElement>(null), peek = useRef<HTMLElement>(null);
  const historyButton = useRef<HTMLButtonElement>(null), controlsButton = useRef<HTMLButtonElement>(null);
  const dismiss = useRef<ReturnType<typeof setTimeout> | null>(null);
  const close = () => { setPanel(null); setPinned(false); };
  const last = useRef(performance.now());
  // Measure only the ribbon. History/controller help are siblings and never change its inset.
  useLayoutEffect(() => {
    const el = root.current; if (!el) return;
    const measure = () => {
      const height = `${Math.ceil(el.getBoundingClientRect().height)}px`;
      if (document.documentElement.style.getPropertyValue('--hud-content-h') === height) return;
      document.documentElement.style.setProperty('--hud-content-h', height);
      window.dispatchEvent(new Event(HUD_LAYOUT_EVENT));
    };
    const observer = new ResizeObserver(measure); observer.observe(el); measure();
    return () => { observer.disconnect(); document.documentElement.style.removeProperty('--hud-content-h'); window.dispatchEvent(new Event(HUD_LAYOUT_EVENT)); };
  }, [legendOn]);
  useLayoutEffect(() => {
    last.current = performance.now();
    const id = setInterval(() => {
      const next = readFrame(session, profile);
      const now = performance.now(), dt = (now - last.current) / 1000; last.current = now;
      if (!paused) rideHistory.push(dt, next.bike.power3s, next.bike.hr5s, next.view.pos.zone);
      next.bars = rideHistory.bars.slice(); setF(next);
    }, 100);
    return () => clearInterval(id);
  }, [session, paused, profile.settings.zoneSource, profile.maxHr]);
  useEffect(() => { close(); }, [paused, session]);
  useEffect(() => {
    if (!panel) return;
    const outside = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!peek.current?.contains(target) && !historyButton.current?.contains(target) && !controlsButton.current?.contains(target) && !pinned) close();
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault(); e.stopPropagation();
      (panel === 'history' ? historyButton : controlsButton).current?.focus(); close();
    };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [panel, pinned]);
  useEffect(() => () => { if (dismiss.current) clearTimeout(dismiss.current); }, []);
  const cancelDismiss = () => { if (dismiss.current) clearTimeout(dismiss.current); };
  const scheduleDismiss = () => {
    cancelDismiss();
    dismiss.current = setTimeout(() => {
      if (!pinned && !peek.current?.matches(':hover') && !peek.current?.contains(document.activeElement) && !historyButton.current?.matches(':hover,:focus-visible')) setPanel(null);
    }, 250);
  };
  const gears = !!f.hud.gears, pad = buildPad(f.hud.controls ?? [], gears);
  const gearShift = [pad.left.shift, pad.right.shift].find(shift => shift?.gears), mb = menu?.();
  const send = (a: unknown) => session.sim.receive?.(a);
  const primary = new Set(f.hud.touchControls ?? []);
  const touchSide = (side: 'L' | 'R') => {
    // Selection never reorders families: all arrow actions left; face buttons A B Y Z right.
    const cluster = side === 'L' ? pad.left.stick : pad.right.stick;
    const selected = compactButtons(cluster).filter(b => primary.has(b.id));
    return selected.length > 0 && <div class={`hud-actions ${side === 'L' ? 'left' : 'right'}`} role="group" aria-label={`${side === 'L' ? 'Direction' : 'Face button'} touch controls`}>
      {selected.map(b => <PadKey key={b.id} b={{ ...b, label: b.label ?? cluster.label }} held={f.held} send={send} disabled={paused} block compact />)}
    </div>;
  };
  const rows = controlRows(f.hud.controls ?? [], Infinity);
  return <>
    <div ref={root} class={`hud hud-ribbon${legendOn ? '' : ' no-pad'}`} key={legendOn ? 'controller' : 'touch'}>
      <div class="hud-center">
        <ZoneWidget ftp={profile.ftp} bike={f.bike} view={f.view} target={f.hud.targetZone} cadenceTarget={f.hud.targetCadence} bars={f.bars} gears={gears} command={f.command} history={false}
          gearControls={gears && gearShift?.buttons.slice().reverse().map(b => <PadKey key={b.id} b={{ ...b, label: b.glyph === '+' ? 'Gear up' : 'Gear down' }} held={f.held} send={send} disabled={paused} merged />)} />
        <nav class="hud-utilities" aria-label="Ride tools">
          <button ref={historyButton} type="button" aria-label="Recent effort history" aria-expanded={panel === 'history'}
            onPointerEnter={e => { if (e.pointerType === 'mouse' && !paused) { cancelDismiss(); setPanel('history'); } }} onPointerLeave={scheduleDismiss}
            onFocus={e => { if (e.currentTarget.matches(':focus-visible') && !paused) setPanel('history'); }} onBlur={scheduleDismiss}
            onClick={e => { cancelDismiss(); if (panel === 'history' && (('pointerType' in e && e.pointerType === 'mouse') || e.detail === 0)) setPinned(true); else { setPinned(false); setPanel(panel === 'history' ? null : 'history'); } }}><b aria-hidden="true">▥</b><span>History</span></button>
          <button ref={controlsButton} type="button" aria-label="Controller guide" aria-expanded={panel === 'controls'} onClick={() => { setPinned(false); setPanel(panel === 'controls' ? null : 'controls'); }}><b aria-hidden="true">⌘</b><span>Controls</span></button>
          <button type="button" class="hud-menu-hit" aria-label={mb?.label ?? 'Open game menu'} title={mb?.label ?? 'Open game menu'} onClick={mb?.onClick ?? (() => input.system('pause'))}><b aria-hidden="true">☰</b><span>Menu</span></button>
        </nav>
      </div>
      <div class="hud-control-row">
        {(legendOn || !f.hud.touchControls) ? <Hood side="L" model={pad.left} held={f.held} paddle={f.paddles[0]} send={send} disabled={paused} compact /> : touchSide('L')}
        {(legendOn || !f.hud.touchControls) ? <Hood side="R" model={pad.right} held={f.held} paddle={f.paddles[1]} send={send} disabled={paused} compact /> : touchSide('R')}
      </div>
    </div>
    {panel && <section ref={peek} class={`hud-peek ${panel === 'controls' ? 'hud-guide' : ''}`} role="region" aria-label={panel === 'history' ? 'Recent effort' : 'Controller guide'} onPointerEnter={cancelDismiss} onPointerLeave={panel === 'history' ? scheduleDismiss : undefined} onFocusIn={cancelDismiss} onFocusOut={panel === 'history' ? scheduleDismiss : undefined}>
      <header><b>{panel === 'history' ? 'Recent effort' : 'Controls'}</b><span>{panel === 'history' ? 'Last 3 minutes' : 'Zwift Ride'}</span>
        {panel === 'history' && <button type="button" aria-pressed={pinned} onClick={() => setPinned(!pinned)}>{pinned ? 'Unpin' : 'Pin'}</button>}
        <button type="button" aria-label="Close HUD panel" onClick={() => { (panel === 'history' ? historyButton : controlsButton).current?.focus(); close(); }}>×</button>
      </header>
      {panel === 'history' ? <><RideHistory ftp={profile.ftp} bars={f.bars} /><footer>Colored bars: power · White line: heart rate</footer></> : <>
        <div class="hud-map-diagram"><Hood side="L" model={pad.left} held={f.held} paddle={f.paddles[0]} disabled reference /><Hood side="R" model={pad.right} held={f.held} paddle={f.paddles[1]} disabled reference /></div>
        <div class="hud-map-list">{rows.map((r, i) => <p key={i}><span>{r.glyphs.map((g, j) => <kbd key={j} style={{ color: g.color }}>{g.glyph}</kbd>)}</span>{r.label}</p>)}</div>
        {fake && <FakeBikeHelp />}
      </>}
    </section>}
  </>;
}
