import type { Army } from './types';

/** A knight is worth this many soldiers in a fight. */
export const KNIGHT_POWER = 3;

export function emptyArmy(): Army {
  return { soldiers: 0, knights: 0, catapults: 0 };
}

export function addArmies(a: Army, b: Army): Army {
  return {
    soldiers: a.soldiers + b.soldiers,
    knights: a.knights + b.knights,
    catapults: a.catapults + b.catapults,
  };
}

/** Fighting strength; catapults don't fight in the field. */
export function strength(a: Army): number {
  return a.soldiers + a.knights * KNIGHT_POWER;
}

/**
 * Removes `damage` points of troops: soldiers die first, then knights
 * (KNIGHT_POWER points each). Catapults are lost once no troops are left.
 */
export function applyCasualties(a: Army, damage: number): Army {
  let left = Math.max(0, Math.round(damage));
  const soldiersLost = Math.min(a.soldiers, left);
  left -= soldiersLost;
  const knightsLost = Math.min(a.knights, Math.ceil(left / KNIGHT_POWER));
  const soldiers = a.soldiers - soldiersLost;
  const knights = a.knights - knightsLost;
  return { soldiers, knights, catapults: soldiers + knights > 0 ? a.catapults : 0 };
}
