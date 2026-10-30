import { applyCasualties, armyLosses, KNIGHT_POWER, strength } from './army';
import type { Rng } from './rng';
import { RuleError, type Army } from './types';

export interface BattleInput {
  attacker: Army;
  defender: Army;
  attackerLeadership: number;
  defenderLeadership: number;
  castle: boolean;
  /**
   * Share of the castle wall (0 to 1) knocked down by a siege the player
   * fought before the assault; absent, the catapults' expected damage is used.
   */
  wallDamage?: number;
}

export interface BattleResult {
  attackerWon: boolean;
  /** Survivors on each side. */
  attacker: Army;
  defender: Army;
  rounds: number;
}

/**
 * The attacker's choice each round:
 * - advance: an even exchange of blows
 * - charge: knights strike twice as hard but lead, so they fall first and take more return fire
 * - bombard: catapults fire over castle walls with little return fire (sieges only)
 * - retreat: withdraw with the survivors
 */
export type Tactic = 'advance' | 'charge' | 'bombard' | 'retreat';

/** A battle in progress; advanced one round at a time by fightRound. */
export interface Battle extends BattleInput {
  /** Wall factor dividing damage dealt to the defenders. */
  bonus: number;
  startStrength: number;
  round: number;
  over: boolean;
  attackerWon: boolean;
}

export interface RoundReport {
  tactic: Tactic;
  attackerLosses: Army;
  defenderLosses: Army;
}

/** Share of a side's power dealt as damage each round. */
const DAMAGE_RATE = 0.1;
/** The automatic attacker retreats when reduced below this share of its starting strength. */
const RETREAT_AT = 0.25;
const MAX_ROUNDS = 100;
const CHARGE_RETURN_FIRE = 1.2;
const CATAPULT_DAMAGE = 4;
const BOMBARD_RETURN_FIRE = 0.3;

/** Wall factor of a castle with `wallDamage` (0 to 1) of its wall knocked down: from 3 intact to 1 razed. */
export function wallBonus(castle: boolean, wallDamage: number): number {
  return castle ? 3 - 2 * Math.min(1, Math.max(0, wallDamage)) : 1;
}

/** Wall damage an unplayed siege does: a quarter of the wall per catapult, up to three quarters. */
export function autoWallDamage(catapults: number): number {
  return Math.min(0.75, 0.25 * catapults);
}

/** Castle walls divide damage taken by defenders; each catapult knocks some of that off, down to a floor. */
export function castleBonus(castle: boolean, catapults: number): number {
  return wallBonus(castle, autoWallDamage(catapults));
}

function leadershipFactor(leadership: number): number {
  return 1 + 0.1 * leadership;
}

function checkEnd(b: Battle): void {
  if (strength(b.defender) === 0) {
    b.over = true;
    b.attackerWon = strength(b.attacker) > 0;
  } else if (strength(b.attacker) === 0 || b.round >= MAX_ROUNDS) {
    b.over = true;
    b.attackerWon = false;
  }
}

export function startBattle(input: BattleInput): Battle {
  const battle: Battle = {
    ...input,
    bonus:
      input.wallDamage === undefined
        ? castleBonus(input.castle, input.attacker.catapults)
        : wallBonus(input.castle, input.wallDamage),
    startStrength: strength(input.attacker),
    round: 0,
    over: false,
    attackerWon: false,
  };
  checkEnd(battle);
  return battle;
}

export function availableTactics(b: Battle): Tactic[] {
  const tactics: Tactic[] = ['advance'];
  if (b.attacker.knights > 0) tactics.push('charge');
  if (b.castle && b.attacker.catapults > 0) tactics.push('bombard');
  tactics.push('retreat');
  return tactics;
}

/** Fights one round with the attacker's chosen tactic. */
export function fightRound(b: Battle, tactic: Tactic, rng: Rng): RoundReport {
  if (b.over) throw new RuleError('The battle is over');
  if (!availableTactics(b).includes(tactic)) throw new RuleError(`Cannot ${tactic} now`);
  const attackerBefore = b.attacker;
  const defenderBefore = b.defender;

  if (tactic === 'retreat') {
    b.over = true;
    b.attackerWon = false;
  } else {
    b.round += 1;
    const attackLead = leadershipFactor(b.attackerLeadership);
    const roll = 0.5 + rng.next();
    const returnFire = strength(b.defender) * leadershipFactor(b.defenderLeadership) * DAMAGE_RATE * (0.5 + rng.next());

    let toDefender: number;
    let toAttacker: number;
    if (tactic === 'charge') {
      const chargePower = strength(b.attacker) + b.attacker.knights * KNIGHT_POWER;
      toDefender = (chargePower * attackLead * DAMAGE_RATE * roll) / b.bonus;
      toAttacker = returnFire * CHARGE_RETURN_FIRE;
    } else if (tactic === 'bombard') {
      toDefender = b.attacker.catapults * CATAPULT_DAMAGE * roll;
      toAttacker = returnFire * BOMBARD_RETURN_FIRE;
    } else {
      toDefender = (strength(b.attacker) * attackLead * DAMAGE_RATE * roll) / b.bonus;
      toAttacker = returnFire;
    }
    b.defender = applyCasualties(b.defender, Math.max(1, toDefender));
    b.attacker = applyCasualties(b.attacker, Math.max(1, toAttacker), tactic === 'charge');
    checkEnd(b);
  }

  return {
    tactic,
    attackerLosses: armyLosses(attackerBefore, b.attacker),
    defenderLosses: armyLosses(defenderBefore, b.defender),
  };
}

/** What the automatic attacker does: advance until badly mauled, then retreat. */
export function autoTactic(b: Battle): Tactic {
  return strength(b.attacker) < b.startStrength * RETREAT_AT ? 'retreat' : 'advance';
}

export function battleResult(b: Battle): BattleResult {
  return { attackerWon: b.attackerWon, attacker: b.attacker, defender: b.defender, rounds: b.round };
}

/** Auto-resolves a whole battle. */
export function resolveBattle(input: BattleInput, rng: Rng): BattleResult {
  const battle = startBattle(input);
  while (!battle.over) fightRound(battle, autoTactic(battle), rng);
  return battleResult(battle);
}
