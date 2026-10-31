import { attackableTerritories, defendingArmy, marchableTerritories, type Action } from './actions';
import { addArmies, strength } from './army';
import { castleBonus } from './combat';
import { buy, income, PRICES, upkeep, type Unit } from './economy';
import { neighbours, territoryDef } from './map';
import type { Rng } from './rng';
import { currentLord } from './state';
import { playTurn, withRng, type TurnResult } from './turn';
import type { GameState, LordId, TerritoryId } from './types';

/** Attack only when this many times stronger than the defenders (after castle walls). */
const ATTACK_MARGIN = 1.5;
/** March home to collect the garrison once it is this fraction of the army's strength. */
const RESERVE_SHARE = 0.3;

function canSustain(state: GameState, lordId: LordId, unit: Unit): boolean {
  const lord = state.lords[lordId];
  const after = addArmies(addArmies(lord.army, lord.reserve), {
    soldiers: unit === 'soldier' ? 1 : 0,
    knights: unit === 'knight' ? 1 : 0,
    catapults: unit === 'catapult' ? 1 : 0,
  });
  return lord.gold >= PRICES[unit] && upkeep(after) <= income(state, lordId);
}

/** Spends gold on troops the lord's income can keep paying for. */
export function aiSpend(state: GameState, lordId: LordId): void {
  const lord = state.lords[lordId];
  // Troops are mustered at the home castle, so a lord in the field saves its gold for the next visit.
  if (lord.armyAt !== lord.home) return;
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

/** How keen a lord is to fight a territory's owner: the other faction most, their own least. */
function rivalry(state: GameState, lordId: LordId, owner: LordId | null): number {
  if (!owner) return 1;
  return state.lords[owner].faction === state.lords[lordId].faction ? 0.3 : 1.5;
}

/**
 * True when an enemy army strong enough to take the lord's home castle could
 * reach it soon: it can strike the castle now, or a territory next to it.
 */
export function homeThreatened(state: GameState, lordId: LordId): boolean {
  const home = state.lords[lordId].home;
  const approaches = new Set([home, ...neighbours(home)]);
  return Object.values(state.lords).some((other) => {
    if (!other.alive || other.id === lordId) return false;
    if (strength(other.army) < defenceRating(state, other.id, home)) return false;
    return attackableTerritories(state, other.id).some((t) => approaches.has(t));
  });
}

export function chooseAiAction(state: GameState, lordId: LordId, rng: Rng): Action {
  const lord = state.lords[lordId];
  const myStrength = strength(lord.army);

  // Best target among those we can beat comfortably: an enemy home castle
  // first, since taking it ends that lord; otherwise most income per defender.
  // Either way, the other faction is preferred.
  let best: { target: TerritoryId; score: number; isHome: boolean } | null = null;
  for (const target of attackableTerritories(state, lordId)) {
    const defence = defenceRating(state, lordId, target);
    if (myStrength < defence * ATTACK_MARGIN) continue;
    const owner = state.territories[target].owner;
    const isHome = owner !== null && state.lords[owner].home === target;
    const score =
      ((isHome ? 1000 : 0) + territoryDef(target).income / (defence + 1)) * rivalry(state, lordId, owner);
    if (!best || score > best.score) best = { target, score, isHome };
  }
  if (best?.isHome) return { type: 'conquer', target: best.target };

  // A threatened home comes first: march back, or stay put if already there.
  if (homeThreatened(state, lordId)) {
    if (lord.armyAt !== lord.home && marchableTerritories(state, lordId).includes(lord.home)) {
      return { type: 'march', target: lord.home };
    }
    if (lord.armyAt === lord.home) best = null;
  }
  // Visit the home castle to spend the gold saved up once it would add a good share to the army.
  const goHome =
    lord.armyAt !== lord.home &&
    canSustain(state, lordId, 'soldier') &&
    lord.gold >= myStrength * RESERVE_SHARE &&
    marchableTerritories(state, lordId).includes(lord.home);
  if (goHome) return { type: 'march', target: lord.home };
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
export function playAiTurn(state: GameState): TurnResult {
  const lord = currentLord(state);
  aiSpend(state, lord.id);
  const action = withRng(state, (rng) => chooseAiAction(state, lord.id, rng));
  return playTurn(state, action);
}
