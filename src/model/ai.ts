import { attackableTerritories, defendingArmy, type Action, type ActionOutcome } from './actions';
import { addArmies, strength } from './army';
import { castleBonus } from './combat';
import { buy, income, PRICES, upkeep, type Unit } from './economy';
import { territoryDef } from './map';
import type { Rng } from './rng';
import { currentLord } from './state';
import { playTurn, withRng } from './turn';
import type { GameState, LordId, TerritoryId } from './types';

/** Attack only when this many times stronger than the defenders (after castle walls). */
const ATTACK_MARGIN = 1.5;

function canSustain(state: GameState, lordId: LordId, unit: Unit): boolean {
  const lord = state.lords[lordId];
  const after = addArmies(lord.army, {
    soldiers: unit === 'soldier' ? 1 : 0,
    knights: unit === 'knight' ? 1 : 0,
    catapults: unit === 'catapult' ? 1 : 0,
  });
  return lord.gold >= PRICES[unit] && upkeep(after) <= income(state, lordId);
}

/** Spends gold on troops the lord's income can keep paying for. */
export function aiSpend(state: GameState, lordId: LordId): void {
  const lord = state.lords[lordId];
  const enemyCastleInReach = attackableTerritories(state, lordId).some(
    (id) => state.territories[id].castle,
  );
  if (lord.army.catapults < 4 && enemyCastleInReach && canSustain(state, lordId, 'catapult')) {
    buy(state, lordId, 'catapult', 1);
  }
  // Half the remaining gold on knights, the rest on soldiers.
  const knightBudget = Math.floor(lord.gold / 2);
  for (let spent = 0; spent + PRICES.knight <= knightBudget; spent += PRICES.knight) {
    if (!canSustain(state, lordId, 'knight')) break;
    buy(state, lordId, 'knight', 1);
  }
  while (canSustain(state, lordId, 'soldier')) buy(state, lordId, 'soldier', 1);
}

/** Effective strength needed to beat a territory's defenders, castle walls included. */
export function defenceRating(state: GameState, attackerId: LordId, target: TerritoryId): number {
  const territory = state.territories[target];
  const catapults = state.lords[attackerId].army.catapults;
  return strength(defendingArmy(state, target)) * castleBonus(territory.castle, catapults);
}

export function chooseAiAction(state: GameState, lordId: LordId, rng: Rng): Action {
  const lord = state.lords[lordId];
  const myStrength = strength(lord.army);

  // Best target among those we can beat comfortably: an enemy home castle
  // first, since taking it ends that lord; otherwise most income per defender.
  let best: { target: TerritoryId; score: number } | null = null;
  for (const target of attackableTerritories(state, lordId)) {
    const defence = defenceRating(state, lordId, target);
    if (myStrength < defence * ATTACK_MARGIN) continue;
    const owner = state.territories[target].owner;
    const isEnemyHome = owner !== null && state.lords[owner].home === target;
    const score = (isEnemyHome ? 1000 : 0) + territoryDef(target).income / (defence + 1);
    if (!best || score > best.score) best = { target, score };
  }
  if (best) return { type: 'conquer', target: best.target };

  const rivals = Object.values(state.lords).filter((l) => l.alive && l.id !== lordId);
  const roll = rng.next();
  if (roll < 0.3) {
    const richest = rivals.reduce((a, b) => (b.gold > a.gold ? b : a));
    if (richest.gold >= 10) return { type: 'raid', target: richest.id };
  } else if (roll < 0.5) {
    return { type: 'tournament', opponent: rng.pick(rivals).id, stake: 'fame' };
  }
  return { type: 'pass' };
}

/** Plays the current lord's whole turn as the AI. */
export function playAiTurn(state: GameState): ActionOutcome {
  const lord = currentLord(state);
  aiSpend(state, lord.id);
  const action = withRng(state, (rng) => chooseAiAction(state, lord.id, rng));
  return playTurn(state, action);
}
