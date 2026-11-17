import '../chrome/chrome.css';
import type { GameModule } from '../../contracts';
import { ChromeHints } from '../chrome/ChromeHints';
import { Btn } from '../components/Bits';
import { useMenuNav } from '../useMenuNav';

/**
 * Shown while the rider approaches a game's entrance on the overworld road: they ride into it, or A jumps straight in
 * (a stopped rider never gets stuck), B cancels back to the arcade. While the game loads in the background (`ready`
 * false) the entrance isn't on the road yet; A then opens it right at the rider once it is.
 */
export function EntryChip({ game, ready, onJump, onCancel }: { game: GameModule; ready: boolean; onJump: () => void; onCancel: () => void }) {
  useMenuNav(1, 1, onJump, onCancel);
  const gate = game.entry === 'gate';
  return (
    <div class="entry-chip chrome-ui" role="status" style={{ '--entry-accent': game.accent ?? '#ffffff' } as Record<string, string>}>
      <span class="entry-chip-label">{!ready ? (gate ? 'Setting up the start gate' : 'Opening a portal') : gate ? 'Start gate ahead' : 'Ride into the portal'}: <b>{game.title}</b>{!ready && <span class="entry-chip-dots" aria-hidden="true" />}</span>
      <span class="entry-chip-actions">
        <Btn primary onClick={onJump}>Jump in</Btn>
        <Btn onClick={onCancel}>Cancel</Btn>
      </span>
      <ChromeHints hints={[['a', 'Jump in'], ['b', 'Cancel']]} />
    </div>
  );
}
