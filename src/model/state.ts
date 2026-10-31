import type { GameState, Lord } from './types';

export const STATE_VERSION = 4;
const LOG_LIMIT = 100;

export function addLog(state: GameState, message: string): void {
  state.log.push(message);
}

/** Keeps only the latest log lines; called once per turn so a turn's own lines can be read first. */
export function trimLog(state: GameState): void {
  if (state.log.length > LOG_LIMIT) state.log.splice(0, state.log.length - LOG_LIMIT);
}

export function currentLord(state: GameState): Lord {
  return state.lords[state.turnOrder[state.current]];
}

export function playerLord(state: GameState): Lord {
  const lord = Object.values(state.lords).find((l) => l.isPlayer);
  if (!lord) throw new Error('No player lord in game state');
  return lord;
}

/** Lost when the player's castle falls; won once every Norman lord is gone. */
export function updateStatus(state: GameState): void {
  if (!playerLord(state).alive) state.status = 'lost';
  else if (!Object.values(state.lords).some((l) => l.alive && l.faction === 'norman')) state.status = 'won';
}
