import type { Rng } from './rng';
import { addLog, playerLord } from './state';
import { RuleError, type GameState, type LordId } from './types';

/** Saxon ladies the Normans may carry off, each at most once. */
export const LADIES = ['Lady Elfrida', 'Lady Aelswith', 'Lady Edith', 'Lady Wynflaed'] as const;

export const KIDNAP_CHANCE = 0.12;
/** Months a lady waits for rescue before her captor forces a marriage. */
export const CAPTIVE_MONTHS = 8;
export const DOWRY = 15;
export const WEDDING_DOWRY = 30;

export function monthIndex(state: GameState): number {
  return state.year * 12 + state.month;
}

/** Random events at the start of each month: the Normans carry off a Saxon lady. */
export function monthlyEvents(state: GameState, rng: Rng): void {
  const kidnap = state.kidnap;
  if (kidnap) {
    const captor = state.lords[kidnap.captor];
    if (!captor.alive) {
      addLog(state, `With ${captor.name} fallen, ${kidnap.lady} escapes and returns home.`);
      state.kidnap = null;
    } else if (monthIndex(state) - kidnap.since >= CAPTIVE_MONTHS) {
      captor.fame += 1;
      addLog(state, `No one came for ${kidnap.lady}: she is wed to ${captor.name} against her will.`);
      state.kidnap = null;
    }
    return;
  }

  const ladies = LADIES.filter((l) => !state.ladiesTaken.includes(l));
  const normans = Object.values(state.lords).filter((l) => l.alive && l.faction === 'norman');
  if (!playerLord(state).alive || ladies.length === 0 || normans.length === 0) return;
  if (rng.next() >= KIDNAP_CHANCE) return;

  const lady = rng.pick(ladies);
  const captor = rng.pick(normans);
  state.ladiesTaken.push(lady);
  state.kidnap = { lady, captor: captor.id, since: monthIndex(state) };
  addLog(state, `${captor.name} has carried off ${lady} to his castle!`);
}

export function rescueChance(state: GameState, lordId: LordId): number {
  return Math.min(0.9, Math.max(0.1, 0.2 + 0.1 * state.lords[lordId].stats.swordplay));
}

export function requireKidnap(state: GameState, lordId: LordId): NonNullable<GameState['kidnap']> {
  const kidnap = state.kidnap;
  if (!kidnap || !state.lords[kidnap.captor].alive) throw new RuleError('No lady awaits rescue');
  if (!state.lords[lordId].isPlayer) throw new RuleError('Only the hero can attempt a rescue');
  return kidnap;
}

/**
 * Applies a rescue's result (from the sword fight, or auto-resolved). The first
 * lady the hero saves marries him and brings a larger dowry.
 */
export function applyRescue(state: GameState, lordId: LordId, won: boolean): void {
  const kidnap = requireKidnap(state, lordId);
  const lord = state.lords[lordId];
  const captor = state.lords[kidnap.captor];
  if (!won) {
    lord.army.soldiers -= Math.ceil(lord.army.soldiers * 0.2);
    lord.fame = Math.max(0, lord.fame - 1);
    addLog(state, `${lord.name} fails to rescue ${kidnap.lady} from ${captor.name}.`);
    return;
  }
  state.kidnap = null;
  lord.fame += 3;
  captor.fame = Math.max(0, captor.fame - 1);
  addLog(state, `${lord.name} rescues ${kidnap.lady} from ${captor.name}'s castle!`);
  if (state.wife === null) {
    state.wife = kidnap.lady;
    lord.gold += WEDDING_DOWRY;
    addLog(state, `${kidnap.lady} and ${lord.name} are wed. Her dowry: ${WEDDING_DOWRY} gold.`);
  } else {
    lord.gold += DOWRY;
    addLog(state, `Her grateful family sends ${DOWRY} gold.`);
  }
}
