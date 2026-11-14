import '../chrome/chrome.css';
import type { GameModule } from '../../contracts';
import { ChromeHints } from '../chrome/ChromeHints';
import { Btn } from '../components/Bits';
import { useMenuNav } from '../useMenuNav';

/**
 * Shown while the rider approaches a game's entrance on the overworld road: they ride into it, or A jumps straight in
 * (a stopped rider never gets stuck), B cancels back to the arcade.
 */
export function EntryChip({ game, onJump, onCancel }: { game: GameModule; onJump: () => void; onCancel: () => void }) {
  useMenuNav(1, 1, onJump, onCancel);
  const gate = game.entry === 'gate';
  return (
    <div class="entry-chip chrome-ui" role="status" style={{ '--entry-accent': game.accent ?? '#ffffff' } as Record<string, string>}>
      <span class="entry-chip-label">{gate ? 'Start gate ahead' : 'Ride into the portal'}: <b>{game.title}</b></span>
      <span class="entry-chip-actions">
        <Btn primary onClick={onJump}>Jump in</Btn>
        <Btn onClick={onCancel}>Cancel</Btn>
      </span>
      <ChromeHints hints={[['a', 'Jump in'], ['b', 'Cancel']]} />
    </div>
  );
}
