import type { Rng } from './rng';

/** How a lance meets the other rider's shield. */
export type Strike = 'unhorse' | 'glance' | 'miss';

export const MAX_PASSES = 3;
export const STRIKE_POINTS: Record<Strike, number> = { unhorse: 3, glance: 1, miss: 0 };

/** Inside this share of the shield's radius the hit is clean enough to unhorse. */
const CLEAN_HIT = 0.4;

/** Scores the player's aim: dead centre unhorses, the rest of the shield glances off. */
export function scoreStrike(distance: number, shieldRadius: number): Strike {
  if (distance <= shieldRadius * CLEAN_HIT) return 'unhorse';
  if (distance <= shieldRadius) return 'glance';
  return 'miss';
}

/** The opponent's lance: better jousters unhorse more often. */
export function opponentStrike(jousting: number, rng: Rng): Strike {
  const unhorse = 0.06 + 0.05 * jousting;
  const roll = rng.next();
  if (roll < unhorse) return 'unhorse';
  if (roll < unhorse + 0.45) return 'glance';
  return 'miss';
}

/** How far the player's lance tip wanders, in pixels at full size; steadier for better jousters. */
export function lanceSway(jousting: number): number {
  return 4 + (5 - jousting) * 4;
}

export interface Joust {
  pass: number;
  playerPoints: number;
  opponentPoints: number;
  over: boolean;
  won: boolean;
}

export function startJoust(): Joust {
  return { pass: 0, playerPoints: 0, opponentPoints: 0, over: false, won: false };
}

/**
 * Records one pass. A rider unhorsed alone loses at once; otherwise points
 * decide after MAX_PASSES, and a tie goes to the opponent (the challenger
 * must win outright).
 */
export function recordPass(joust: Joust, player: Strike, opponent: Strike): void {
  if (joust.over) throw new Error('The joust is over');
  joust.pass += 1;
  joust.playerPoints += STRIKE_POINTS[player];
  joust.opponentPoints += STRIKE_POINTS[opponent];

  if (player === 'unhorse' && opponent !== 'unhorse') {
    joust.over = true;
    joust.won = true;
  } else if (opponent === 'unhorse' && player !== 'unhorse') {
    joust.over = true;
    joust.won = false;
  } else if (joust.pass >= MAX_PASSES) {
    joust.over = true;
    joust.won = joust.playerPoints > joust.opponentPoints;
  }
}
