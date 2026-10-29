import { addArmies } from './army';
import { territoryDef } from './map';
import {
  RuleError,
  type Army,
  type GameState,
  type LordId,
  type Territory,
  type TerritoryId,
} from './types';

export const PRICES = { soldier: 1, knight: 4, catapult: 15, castle: 20 } as const;
export type Unit = 'soldier' | 'knight' | 'catapult';

export function ownedTerritories(state: GameState, lordId: LordId): TerritoryId[] {
  return Object.values(state.territories)
    .filter((t) => t.owner === lordId)
    .map((t) => t.id);
}

export function income(state: GameState, lordId: LordId): number {
  return ownedTerritories(state, lordId).reduce((sum, id) => sum + territoryDef(id).income, 0);
}

/** Monthly cost of keeping the campaign army in the field. */
export function upkeep(army: Army): number {
  return Math.floor((army.soldiers + army.knights * 4 + army.catapults * 10) / 10);
}

/** Adds income minus upkeep. If the lord can't pay, a tenth of the soldiers desert. */
export function collectIncome(state: GameState, lordId: LordId): number {
  const lord = state.lords[lordId];
  const net = income(state, lordId) - upkeep(lord.army);
  lord.gold += net;
  if (lord.gold < 0) {
    lord.gold = 0;
    lord.army.soldiers -= Math.ceil(lord.army.soldiers / 10);
  }
  return net;
}

/** Most vassals a territory can raise; a castle doubles it. */
export function garrisonCap(territory: Territory): number {
  return territoryDef(territory.id).income * (territory.castle ? 6 : 3);
}

/** Each territory raises one vassal soldier a month (two with a castle), up to its cap. */
export function growGarrisons(state: GameState): void {
  for (const t of Object.values(state.territories)) {
    const cap = garrisonCap(t);
    if (t.garrison.soldiers < cap) t.garrison.soldiers = Math.min(cap, t.garrison.soldiers + (t.castle ? 2 : 1));
  }
}

function unitArmy(unit: Unit, qty: number): Army {
  return {
    soldiers: unit === 'soldier' ? qty : 0,
    knights: unit === 'knight' ? qty : 0,
    catapults: unit === 'catapult' ? qty : 0,
  };
}

export function maxAffordable(state: GameState, lordId: LordId, unit: Unit): number {
  return Math.floor(state.lords[lordId].gold / PRICES[unit]);
}

/** Buys units into the campaign army. Doesn't use up the turn. */
export function buy(state: GameState, lordId: LordId, unit: Unit, qty: number): void {
  if (!Number.isInteger(qty) || qty <= 0) throw new RuleError(`Invalid quantity: ${qty}`);
  const lord = state.lords[lordId];
  const cost = PRICES[unit] * qty;
  if (cost > lord.gold) throw new RuleError(`Not enough gold: need ${cost}, have ${lord.gold}`);
  lord.gold -= cost;
  lord.army = addArmies(lord.army, unitArmy(unit, qty));
}

/** Fortifies one of the lord's territories. Doesn't use up the turn. */
export function buildCastle(state: GameState, lordId: LordId, territoryId: TerritoryId): void {
  const lord = state.lords[lordId];
  const territory = state.territories[territoryId];
  if (territory?.owner !== lordId) throw new RuleError(`${territoryId} is not yours`);
  if (territory.castle) throw new RuleError(`${territoryId} already has a castle`);
  if (lord.gold < PRICES.castle) throw new RuleError(`Not enough gold for a castle`);
  lord.gold -= PRICES.castle;
  territory.castle = true;
}
