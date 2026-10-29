import { addArmies, emptyArmy, strength } from './army';
import { resolveBattle, type BattleInput, type BattleResult } from './combat';
import { garrisonCap } from './economy';
import { neighbours, territoryDef } from './map';
import type { Rng } from './rng';
import { addLog, updateStatus } from './state';
import { RuleError, type Army, type GameState, type LordId, type TerritoryId } from './types';

export type Stake = 'fame' | 'land';

/** The one main action a lord takes each month (buying troops is free). */
export type Action =
  | { type: 'pass' }
  | { type: 'march'; target: TerritoryId }
  /** `result`: a battle already fought in the battle scene; auto-resolved when absent. */
  | { type: 'conquer'; target: TerritoryId; result?: BattleResult }
  | { type: 'raid'; target: LordId }
  | { type: 'tournament'; opponent: LordId; stake: Stake };

export interface ActionOutcome {
  action: Action;
  won?: boolean;
  battle?: BattleResult;
  /** Gold stolen by a raid. */
  gold?: number;
}

/**
 * Territories the campaign army can attack: those bordering any land the lord
 * holds that is connected to where the army stands (it marches through its own land).
 */
export function attackableTerritories(state: GameState, lordId: LordId): TerritoryId[] {
  const lord = state.lords[lordId];
  if (!lord.alive || strength(lord.army) === 0) return [];
  const reached = new Set([lord.armyAt]);
  const queue = [lord.armyAt];
  const targets = new Set<TerritoryId>();
  while (queue.length > 0) {
    for (const n of neighbours(queue.shift()!)) {
      if (state.territories[n].owner !== lordId) targets.add(n);
      else if (!reached.has(n)) {
        reached.add(n);
        queue.push(n);
      }
    }
  }
  return [...targets];
}

/** Own territories the campaign army can march to: those connected to where it stands. */
export function marchableTerritories(state: GameState, lordId: LordId): TerritoryId[] {
  const lord = state.lords[lordId];
  if (!lord.alive) return [];
  const reached = new Set([lord.armyAt]);
  const queue = [lord.armyAt];
  while (queue.length > 0) {
    for (const n of neighbours(queue.shift()!)) {
      if (state.territories[n].owner === lordId && !reached.has(n)) {
        reached.add(n);
        queue.push(n);
      }
    }
  }
  reached.delete(lord.armyAt);
  return [...reached];
}

export function march(state: GameState, lordId: LordId, target: TerritoryId): void {
  if (!marchableTerritories(state, lordId).includes(target)) {
    throw new RuleError(`Cannot march to ${target}`);
  }
  const lord = state.lords[lordId];
  lord.armyAt = target;
  addLog(state, `${lord.name} marches to ${territoryDef(target).name}.`);
}

/** Garrison plus the owner's campaign army if it stands there. */
export function defendingArmy(state: GameState, territoryId: TerritoryId): Army {
  const territory = state.territories[territoryId];
  const owner = territory.owner ? state.lords[territory.owner] : null;
  return owner?.armyAt === territoryId ? addArmies(territory.garrison, owner.army) : territory.garrison;
}

/** Sends a lord's campaign army back home if the land it stood on is no longer theirs. */
function regroupArmies(state: GameState): void {
  for (const lord of Object.values(state.lords)) {
    if (lord.alive && state.territories[lord.armyAt].owner !== lord.id) lord.armyAt = lord.home;
  }
}

/**
 * The loser's castle has fallen: the winner seizes their treasury, and the
 * rest of their lands revolt and fall back to their own vassals.
 */
function eliminate(state: GameState, loserId: LordId, winnerId: LordId): void {
  const loser = state.lords[loserId];
  const winner = state.lords[winnerId];
  for (const t of Object.values(state.territories)) {
    if (t.owner === loserId) t.owner = null;
  }
  winner.gold += loser.gold;
  loser.gold = 0;
  loser.army = emptyArmy();
  loser.alive = false;
  addLog(state, `${loser.name} is defeated! ${winner.name} seizes their treasury; their lands revolt.`);
}

/** The two sides of an attack on `target`, ready for startBattle or resolveBattle. */
export function battleInput(state: GameState, lordId: LordId, target: TerritoryId): BattleInput {
  if (!attackableTerritories(state, lordId).includes(target)) {
    throw new RuleError(`Cannot reach ${target}`);
  }
  const lord = state.lords[lordId];
  const territory = state.territories[target];
  const owner = territory.owner ? state.lords[territory.owner] : null;
  return {
    attacker: lord.army,
    defender: defendingArmy(state, target),
    attackerLeadership: lord.stats.leadership,
    // Leaderless vassals of neutral land fight at a middling level.
    defenderLeadership: owner?.stats.leadership ?? 2,
    castle: territory.castle,
  };
}

/**
 * Attacks `target`. The battle is auto-resolved unless `result` is given
 * (a battle the player fought round by round from battleInput).
 */
export function conquer(
  state: GameState,
  lordId: LordId,
  target: TerritoryId,
  rng: Rng,
  result: BattleResult = resolveBattle(battleInput(state, lordId, target), rng),
): BattleResult {
  if (!attackableTerritories(state, lordId).includes(target)) {
    throw new RuleError(`Cannot reach ${target}`);
  }
  const lord = state.lords[lordId];
  const territory = state.territories[target];
  const owner = territory.owner ? state.lords[territory.owner] : null;
  const ownerArmyHere = owner?.armyAt === target;
  const name = territoryDef(target).name;

  lord.army = result.attacker;

  if (result.attackerWon) {
    territory.owner = lordId;
    // Half the local vassals swear fealty to the new lord.
    territory.garrison = { ...emptyArmy(), soldiers: Math.floor(garrisonCap(territory) / 2) };
    lord.armyAt = target;
    lord.fame += 1;
    addLog(state, `${lord.name} conquers ${name}.`);
    if (owner) {
      if (ownerArmyHere) owner.army = emptyArmy();
      if (owner.home === target) eliminate(state, owner.id, lordId);
    }
  } else {
    // Defender losses fall on the garrison first, then on the owner's army.
    const survivors = result.defender;
    const g = territory.garrison;
    territory.garrison = {
      soldiers: Math.min(g.soldiers, survivors.soldiers),
      knights: Math.min(g.knights, survivors.knights),
      catapults: g.catapults,
    };
    if (owner && ownerArmyHere) {
      owner.army = {
        soldiers: survivors.soldiers - territory.garrison.soldiers,
        knights: survivors.knights - territory.garrison.knights,
        catapults: owner.army.catapults,
      };
    }
    addLog(state, `${lord.name} is driven back from ${name}.`);
  }

  regroupArmies(state);
  updateStatus(state);
  return result;
}

const clampChance = (p: number) => Math.min(0.9, Math.max(0.1, p));

export function joustChance(state: GameState, lordId: LordId, opponentId: LordId): number {
  return clampChance(
    0.5 + 0.1 * (state.lords[lordId].stats.jousting - state.lords[opponentId].stats.jousting),
  );
}

export function raidChance(state: GameState, lordId: LordId): number {
  return clampChance(0.25 + 0.1 * state.lords[lordId].stats.swordplay);
}

function requireRival(state: GameState, lordId: LordId, otherId: LordId): void {
  const other = state.lords[otherId];
  if (!other || !other.alive || otherId === lordId) throw new RuleError(`Invalid opponent: ${otherId}`);
}

/**
 * Applies a tournament's result (from the joust minigame, or auto-resolved).
 * Jousting for land: the loser hands one territory, never their home, to the winner.
 */
export function applyTournament(
  state: GameState,
  lordId: LordId,
  opponentId: LordId,
  stake: Stake,
  won: boolean,
  rng: Rng,
): void {
  requireRival(state, lordId, opponentId);
  const winner = state.lords[won ? lordId : opponentId];
  const loser = state.lords[won ? opponentId : lordId];
  winner.fame += stake === 'fame' ? 2 : 1;
  loser.fame = Math.max(0, loser.fame - 1);
  addLog(state, `${winner.name} unhorses ${loser.name} in the tournament.`);

  if (stake === 'land') {
    const lands = Object.values(state.territories).filter(
      (t) => t.owner === loser.id && t.id !== loser.home,
    );
    if (lands.length > 0) {
      const prize = rng.pick(lands);
      prize.owner = winner.id;
      addLog(state, `${loser.name} cedes ${territoryDef(prize.id).name} to ${winner.name}.`);
      regroupArmies(state);
    }
  }
}

/**
 * Applies a raid's result (from the sword-fight minigame, or auto-resolved).
 * Returns the gold stolen.
 */
export function applyRaid(state: GameState, lordId: LordId, targetId: LordId, won: boolean): number {
  requireRival(state, lordId, targetId);
  const lord = state.lords[lordId];
  const target = state.lords[targetId];
  if (won) {
    const stolen = Math.floor(target.gold / 2);
    target.gold -= stolen;
    lord.gold += stolen;
    lord.fame += 1;
    addLog(state, `${lord.name} raids ${target.name}'s castle and steals ${stolen} gold.`);
    return stolen;
  }
  lord.army.soldiers -= Math.ceil(lord.army.soldiers * 0.2);
  lord.fame = Math.max(0, lord.fame - 1);
  addLog(state, `${lord.name}'s raid on ${target.name} fails.`);
  return 0;
}

/** Performs an action, auto-resolving tournaments and raids with the RNG. */
export function performAction(state: GameState, lordId: LordId, action: Action, rng: Rng): ActionOutcome {
  switch (action.type) {
    case 'pass':
      return { action };
    case 'march':
      march(state, lordId, action.target);
      return { action };
    case 'conquer': {
      const battle = conquer(state, lordId, action.target, rng, action.result);
      return { action, won: battle.attackerWon, battle };
    }
    case 'raid': {
      requireRival(state, lordId, action.target);
      const won = rng.next() < raidChance(state, lordId);
      return { action, won, gold: applyRaid(state, lordId, action.target, won) };
    }
    case 'tournament': {
      requireRival(state, lordId, action.opponent);
      const won = rng.next() < joustChance(state, lordId, action.opponent);
      applyTournament(state, lordId, action.opponent, action.stake, won, rng);
      return { action, won };
    }
  }
}
