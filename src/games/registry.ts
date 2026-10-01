import type { GameModule } from '../contracts';
import { module as dungeon } from './dungeon';
import { module as lighthouse } from './lighthouse';
import { module as towerdefense } from './towerdefense';

export const games: GameModule[] = [dungeon, lighthouse, towerdefense];

export function getGame(id: string): GameModule | undefined {
  return games.find((g) => g.id === id);
}
