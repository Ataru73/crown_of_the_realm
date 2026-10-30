import { performAction, type Action, type ActionOutcome } from './actions';
import { collectIncome, growGarrisons } from './economy';
import { monthlyEvents } from './events';
import { Rng } from './rng';
import { addLog, currentLord, trimLog } from './state';
import { RuleError, type GameState, type LordId } from './types';

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

export function dateLabel(state: GameState): string {
  return `${MONTHS[state.month]} ${state.year}`;
}

function startMonth(state: GameState): void {
  state.month += 1;
  if (state.month === 12) {
    state.month = 0;
    state.year += 1;
  }
  growGarrisons(state);
  withRng(state, (rng) => monthlyEvents(state, rng));
}

/** Hands the turn to the next living lord, starting a new month when the order wraps, and pays them. */
export function endTurn(state: GameState): void {
  let i = state.current;
  do {
    i = (i + 1) % state.turnOrder.length;
    if (i === 0) startMonth(state);
  } while (!state.lords[state.turnOrder[i]].alive);
  state.current = i;
  collectIncome(state, state.turnOrder[i]);
}

/** Runs `fn` with the game's RNG and stores the advanced RNG state back. */
export function withRng<T>(state: GameState, fn: (rng: Rng) => T): T {
  const rng = new Rng(state.rngState);
  const result = fn(rng);
  state.rngState = rng.state;
  return result;
}

export interface TurnResult extends ActionOutcome {
  lordId: LordId;
  /** Log lines written during this turn. */
  messages: string[];
}

/** The current lord performs their main action, then the turn passes on. */
export function playTurn(state: GameState, action: Action): TurnResult {
  if (state.status !== 'playing') throw new RuleError('The game is over');
  const lord = currentLord(state);
  const logStart = state.log.length;
  const outcome = withRng(state, (rng) => performAction(state, lord.id, action, rng));
  if (action.type === 'pass') addLog(state, `${lord.name} rests.`);
  if (state.status === 'playing') endTurn(state);
  const messages = state.log.slice(logStart);
  trimLog(state);
  return { ...outcome, lordId: lord.id, messages };
}
