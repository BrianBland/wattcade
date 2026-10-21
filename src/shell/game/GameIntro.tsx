import type { RefObject } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import type { GameHud, GameModule, Profile } from '../../contracts';
import { Btn } from '../components/Bits';
import { ControlLegend } from '../hud/ControlLegend';
import { FakeBikeHelp } from '../hud/FakeBikeHelp';
import { ZONE_COLORS } from '../hud/zoneMath';
import { onMenuPress } from '../menuInput';
import { useMenuNav } from '../useMenuNav';
import './controls.css';

/** Full guide before the countdown or from Pause. Starting is always explicit. */
export function GameIntro({ game, hud, profile, mode, count, onStart, onBack, fake, scrollRef }: {
  game: GameModule; hud: GameHud; profile: Profile; mode: 'pre' | 'help';
  count: number | null; onStart: () => void; onBack: () => void; fake?: boolean;
  scrollRef?: RefObject<HTMLDivElement | null>;
}) {
  const ownRef = useRef<HTMLDivElement>(null), card = scrollRef ?? ownRef, tz = hud.targetZone;
  useEffect(() => {
    if (count != null) return;
    const el = card.current; if (!el) return;
    const previous = document.activeElement as HTMLElement | null;
    el.querySelector<HTMLButtonElement>('.intro-actions .primary')?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); onBack(); }
      if (mode === 'pre' && e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); onStart(); }
      if (e.key === 'Tab') {
        const buttons = [...el.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
        const first = buttons[0], last = buttons.at(-1);
        if (e.shiftKey && (document.activeElement === first || !el.contains(document.activeElement))) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener('keydown', key, true);
    return () => { window.removeEventListener('keydown', key, true); if (previous?.isConnected) previous.focus(); };
  }, [count, mode]);
  // Help uses pause-menu input; GameHost owns pre-game press edges and scrolling.
  useEffect(() => mode === 'help' ? onMenuPress(p => {
    if (p.has('down')) card.current?.scrollBy({ top: 140, behavior: 'smooth' });
    if (p.has('up')) card.current?.scrollBy({ top: -140, behavior: 'smooth' });
  }) : undefined, [mode]);
  if (count != null) return <div class="intro-count" key={count}><b>{count > 0 ? count : 'GO!'}</b>{count > 0 && <small>Get pedaling</small>}</div>;
  let best: string | null = null;
  try { best = game.progressLine?.(profile.gameData[game.id]) ?? null; } catch { /* old save */ }
  return <div class="overlay-modal intro control-intro"><div ref={card} class="modal intro-card controls-card" role="dialog" aria-modal="true" aria-label={`${game.title} controls`}>
    <header class="controls-heading"><div><small>{mode === 'pre' ? 'BEFORE YOU RIDE' : 'PAUSED / CONTROLS'}</small><h1>{game.title}</h1></div>
      {tz && <div class="controls-zone" style={{ color: ZONE_COLORS[tz.min - 1] }}>Aim for <b>{tz.min === tz.max ? `Z${tz.min}` : `Z${tz.min}–${tz.max}`}</b></div>}
      <button type="button" class="controls-close" aria-label={mode === 'pre' ? 'Back to menu' : 'Close controls'} onClick={onBack}>×</button>
    </header>
    <p class="controls-blurb">{game.blurb}</p>
    {best && <p class="dim small">Your best: {best}</p>}
    <ControlLegend hud={hud} />
    {fake && <FakeBikeHelp />}
    <footer><span>Ride: tap both power buttons to pause.<br />↑ ↓ Scroll · A {mode === 'pre' ? 'Start' : 'Back'} · B {mode === 'pre' ? 'Menu' : 'Back'}</span>
      <div class="intro-actions">{mode === 'pre' && <Btn onClick={onBack}>Back to menu</Btn>}<Btn primary focused onClick={mode === 'pre' ? onStart : onBack}>{mode === 'pre' ? 'Start ride →' : 'Back to pause →'}</Btn></div>
    </footer>
  </div></div>;
}

export function IntroHelp({ game, hud, profile, onClose, fake }: { game: GameModule; hud: GameHud; profile: Profile; onClose: () => void; fake?: boolean }) {
  useMenuNav(1, 1, onClose, onClose);
  return <GameIntro game={game} hud={hud} profile={profile} mode="help" count={null} onStart={onClose} onBack={onClose} fake={fake} />;
}
