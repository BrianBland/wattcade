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
import { module as penrose } from './penrose';

/** Games shown in the arcade picker, most polished first (the picker sorts by the rider's recent plays; this breaks ties). */
export const games: GameModule[] = [cadenza, hamster, watershed, dungeon, lighthouse, towerdefense, starfighter];
/**
 * Games still in development: in the picker only with the dev flag (`?dev=1` once, remembered in localStorage;
 * `?dev=0` clears it) or on the Vite dev server. The headless runner always has them.
 */
export const devGames: GameModule[] = [seaside, penrose];
export function devFlag(): boolean {
  const env = (import.meta as { env?: { DEV?: boolean; MODE?: string } }).env;
  if (env?.DEV && env.MODE !== 'test') return true;
  try {
    const q = new URLSearchParams(globalThis.location?.search ?? '').get('dev');
    if (q !== null) globalThis.localStorage?.setItem('wattcade.dev', q === '0' ? '0' : '1');
    return globalThis.localStorage?.getItem('wattcade.dev') === '1';
  } catch { return false; }
}
/** The picker's list: `games`, plus `devGames` behind the dev flag. */
export const pickerGames = (): GameModule[] => (devFlag() ? [...games, ...devGames] : games);
/** The Warm-up Ride the shell runs behind its menus (not in the picker). */
export const lobbyGame: GameModule = warmup;
/** Everything with a sim (picker games + lobby), for the headless runner. */
export const allGames: GameModule[] = [...games, ...devGames, warmup];

export function getGame(id: string): GameModule | undefined {
  return allGames.find((g) => g.id === id);
}
