import { describe, expect, it } from 'vitest';
import { applyCasualties, strength } from '../src/model/army';
import { castleBonus, resolveBattle, type BattleInput } from '../src/model/combat';
import { Rng } from '../src/model/rng';

const army = (soldiers: number, knights = 0, catapults = 0) => ({ soldiers, knights, catapults });

describe('applyCasualties', () => {
  it('kills soldiers before knights', () => {
    expect(applyCasualties(army(10, 2), 4)).toEqual(army(6, 2));
    expect(applyCasualties(army(2, 2), 5)).toEqual(army(0, 1));
  });

  it('loses catapults once no troops are left', () => {
    expect(applyCasualties(army(1, 0, 3), 1)).toEqual(army(0, 0, 0));
    expect(applyCasualties(army(5, 0, 3), 1)).toEqual(army(4, 0, 3));
  });

  it('never goes negative', () => {
    expect(applyCasualties(army(3, 1), 1000)).toEqual(army(0, 0));
  });
});

describe('castleBonus', () => {
  it('is 1 without a castle and drops with catapults down to 1', () => {
    expect(castleBonus(false, 0)).toBe(1);
    expect(castleBonus(true, 0)).toBe(3);
    expect(castleBonus(true, 2)).toBe(2);
    expect(castleBonus(true, 10)).toBe(1);
  });
});

/** How many of `runs` battles the attacker wins. */
function wins(input: BattleInput, runs = 200): number {
  let won = 0;
  for (let seed = 1; seed <= runs; seed++) {
    if (resolveBattle(input, new Rng(seed)).attackerWon) won++;
  }
  return won;
}

describe('resolveBattle', () => {
  const base: BattleInput = {
    attacker: army(30),
    defender: army(30),
    attackerLeadership: 3,
    defenderLeadership: 3,
    castle: false,
  };

  it('wins at once against an empty territory', () => {
    const r = resolveBattle({ ...base, defender: army(0) }, new Rng(1));
    expect(r).toMatchObject({ attackerWon: true, rounds: 0, attacker: army(30) });
  });

  it('is deterministic for a given seed', () => {
    expect(resolveBattle(base, new Rng(9))).toEqual(resolveBattle(base, new Rng(9)));
  });

  it('lets an overwhelming army win', () => {
    expect(wins({ ...base, attacker: army(100, 10) })).toBe(200);
  });

  it('makes castles much harder to take, and catapults help', () => {
    const open = wins({ ...base, attacker: army(60) });
    const walled = wins({ ...base, attacker: army(60), castle: true });
    const sieged = wins({ ...base, attacker: army(60, 0, 4), castle: true });
    expect(walled).toBeLessThan(open);
    expect(sieged).toBeGreaterThan(walled);
  });

  it('rewards leadership', () => {
    expect(wins({ ...base, attackerLeadership: 5, defenderLeadership: 1 })).toBeGreaterThan(
      wins({ ...base, attackerLeadership: 1, defenderLeadership: 5 }),
    );
  });

  it('usually retreats with survivors instead of fighting to the last man', () => {
    let losses = 0;
    let retreats = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const r = resolveBattle({ ...base, attacker: army(40), defender: army(50) }, new Rng(seed));
      if (r.attackerWon) continue;
      losses++;
      if (strength(r.attacker) > 0) retreats++;
    }
    expect(losses).toBeGreaterThan(50);
    expect(retreats).toBeGreaterThan(losses * 0.9);
  });
});
