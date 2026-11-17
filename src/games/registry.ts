import type { GameModule } from '../contracts';
import { module as dungeon } from './dungeon';
import { module as lighthouse } from './lighthouse';
import { module as towerdefense } from './towerdefense';
import { module as starfighter } from './starfighter';
import { module as hamster } from './hamster';
import { module as warmup } from './warmup';
import { module as watershed } from './watershed';
import { module as cadenza } from './cadenza';
import { module as seaside } from './seaside';
import { module as fullsend } from './fullsend';
import { module as penrose } from './penrose';

/** Games shown in the arcade picker, most polished first (the picker sorts by the rider's recent plays; this breaks ties). */
export const games: GameModule[] = [cadenza, hamster, watershed, dungeon, lighthouse, towerdefense, starfighter, fullsend];
/**
 * Games still under construction: always in the picker and playable, but their card wears caution tape
 * (`isWip`) and they sort after finished games on ties. The headless runner has them too.
 */
export const wipGames: GameModule[] = [seaside, penrose];
/** True for a game whose picker card should show the under-construction tape. */
export const isWip = (id: string): boolean => wipGames.some((g) => g.id === id);
/** The picker's list: finished games, then the ones under construction. */
export const pickerGames: GameModule[] = [...games, ...wipGames];
/** The Warm-up Ride the shell runs behind its menus (not in the picker). */
export const lobbyGame: GameModule = warmup;
/** Everything with a sim (picker games + lobby), for the headless runner. */
export const allGames: GameModule[] = [...games, ...wipGames, warmup];

export function getGame(id: string): GameModule | undefined {
  return allGames.find((g) => g.id === id);
}
