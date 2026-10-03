import type { GameHud, GameModule, Profile } from '../../contracts';
import { Btn } from '../components/Bits';
import { KeyHints } from '../components/ui';
import { controlRows } from '../controlGlyphs';
import { ZONE_COLORS } from '../hud/zoneMath';
import { useMenuNav } from '../useMenuNav';

const TAG_LABEL: Record<string, string> = { zone2: 'Zone 2', sprint: 'Sprint', intervals: 'Intervals' };

/**
 * Before a game: title, how to play, the target zone and the current controls, then a 3-2-1-GO countdown.
 * `mode: 'help'` reopens it from the pause menu (no countdown; A/B closes). In 'pre' mode the GameHost feeds presses.
 */
export function GameIntro({ game, hud, profile, mode, count, autoLeft, onStart, onBack }: {
  game: GameModule; hud: GameHud; profile: Profile; mode: 'pre' | 'help';
  /** null = waiting; 3..1 = counting; 0 = GO */
  count: number | null; autoLeft: number; onStart: () => void; onBack: () => void;
}) {
  const rows = controlRows(hud.controls ?? []);
  const tz = hud.targetZone;
  let line: string | null = null;
  try { line = game.progressLine?.(profile.gameData[game.id]) ?? null; } catch { /* bad save */ }
  if (count != null) {
    return (
      <div class="intro-count" key={count}>
        <b>{count > 0 ? count : 'GO!'}</b>
        {count > 0 && <small>Get pedalling</small>}
      </div>
    );
  }
  return (
    <div class="overlay-modal intro">
      <div class="modal intro-card">
        <div class="intro-head">
          <div><h1>{game.title}</h1><div class="tags">{game.tags.map((t) => <span class={`tag ${t}`}>{TAG_LABEL[t] ?? t}</span>)}</div></div>
          <span class="spacer" />
          {tz && <div class="intro-zone" style={{ '--zc': ZONE_COLORS[tz.min - 1] } as Record<string, string>}>
            <small>Aim for</small><b>{tz.min === tz.max ? `Zone ${tz.min}` : `Z${tz.min}–Z${tz.max}`}</b>{tz.label && <small>{tz.label}</small>}
          </div>}
        </div>
        <p class="intro-blurb">{game.blurb}</p>
        {line && <div class="intro-progress">Your best: {line}</div>}
        {rows.length > 0 && (
          <div class="intro-controls">
            {rows.map((r) => (
              <div class={`ctl${r.active ? ' active' : ''}`}>
                <span class="glyphs">{r.glyphs.map((g) => <span class="key" style={{ '--kc': g.color } as Record<string, string>}>{g.glyph}</span>)}</span>
                <span>{r.label}</span>
              </div>
            ))}
          </div>
        )}
        <div class="row">
          {mode === 'pre' ? <>
            <Btn primary focused onClick={onStart}>▶ Start {autoLeft > 0 && <small class="auto">({Math.ceil(autoLeft)})</small>}</Btn>
            <Btn onClick={onBack}>Back to menu</Btn>
          </> : <Btn primary focused onClick={onBack}>Back</Btn>}
        </div>
        <KeyHints hints={mode === 'pre' ? [['a', 'Start'], ['b', 'Back to menu']] : [['a', 'Close'], ['b', 'Close']]} />
      </div>
    </div>
  );
}

/** The intro card reopened from the pause menu: A or B closes it. */
export function IntroHelp({ game, hud, profile, onClose }: { game: GameModule; hud: GameHud; profile: Profile; onClose: () => void }) {
  useMenuNav(1, 1, onClose, onClose);
  return <GameIntro game={game} hud={hud} profile={profile} mode="help" count={null} autoLeft={0} onStart={onClose} onBack={onClose} />;
}
