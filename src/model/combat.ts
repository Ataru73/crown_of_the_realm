import { applyCasualties, strength } from './army';
import type { Rng } from './rng';
import type { Army } from './types';

export interface BattleInput {
  attacker: Army;
  defender: Army;
  attackerLeadership: number;
  defenderLeadership: number;
  castle: boolean;
}

export interface BattleResult {
  attackerWon: boolean;
  /** Survivors on each side. */
  attacker: Army;
  defender: Army;
  rounds: number;
}

/** Share of a side's power dealt as damage each round. */
const DAMAGE_RATE = 0.1;
/** The attacker retreats when reduced below this share of its starting strength. */
const RETREAT_AT = 0.25;
const MAX_ROUNDS = 100;

/** Castle walls divide damage taken by defenders; each catapult knocks some of that off. */
export function castleBonus(castle: boolean, catapults: number): number {
  return castle ? Math.max(1, 3 - 0.5 * catapults) : 1;
}

function power(army: Army, leadership: number): number {
  return strength(army) * (1 + 0.1 * leadership);
}

/** Auto-resolves a battle round by round. */
export function resolveBattle(input: BattleInput, rng: Rng): BattleResult {
  let attacker = input.attacker;
  let defender = input.defender;
  const startStrength = strength(attacker);
  const bonus = castleBonus(input.castle, attacker.catapults);

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    if (strength(defender) === 0) {
      return { attackerWon: strength(attacker) > 0, attacker, defender, rounds: round - 1 };
    }
    if (strength(attacker) < startStrength * RETREAT_AT) {
      return { attackerWon: false, attacker, defender, rounds: round - 1 };
    }
    const toDefender = (power(attacker, input.attackerLeadership) * DAMAGE_RATE * (0.5 + rng.next())) / bonus;
    const toAttacker = power(defender, input.defenderLeadership) * DAMAGE_RATE * (0.5 + rng.next());
    defender = applyCasualties(defender, Math.max(1, toDefender));
    attacker = applyCasualties(attacker, Math.max(1, toAttacker));
  }
  return { attackerWon: false, attacker, defender, rounds: MAX_ROUNDS };
}
