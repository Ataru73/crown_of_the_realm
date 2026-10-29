import { newGame } from '../src/model/setup';
import type { GameState } from '../src/model/types';

/** A fresh game with the player as Wulfric (all stats 3). */
export function game(seed = 1): GameState {
  return newGame('wulfric', seed);
}

/** In-memory stand-in for localStorage. */
export function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}
