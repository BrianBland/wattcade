import type { GameModule } from '../contracts';
import { module as dungeon } from './dungeon';
import { module as lighthouse } from './lighthouse';
import { module as towerdefense } from './towerdefense';
import { module as starfighter } from './starfighter';
import { module as hamster } from './hamster';
import { module as warmup } from './warmup';
import { module as watershed } from './watershed';
import { module as cadenza } from './cadenza';

/** Games shown in the arcade picker, most polished first (the picker sorts by the rider's recent plays; this breaks ties). */
export const games: GameModule[] = [cadenza, hamster, watershed, dungeon, lighthouse, towerdefense, starfighter];
/** The Warm-up Ride the shell runs behind its menus (not in the picker). */
export const lobbyGame: GameModule = warmup;
/** Everything with a sim (picker games + lobby), for the headless runner. */
export const allGames: GameModule[] = [...games, warmup];

export function getGame(id: string): GameModule | undefined {
  return allGames.find((g) => g.id === id);
}
