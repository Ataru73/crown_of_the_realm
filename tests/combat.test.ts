import { describe, expect, it } from 'vitest';
import { applyCasualties, strength } from '../src/model/army';
import {
  autoTactic,
  availableTactics,
  castleBonus,
  fightRound,
  resolveBattle,
  startBattle,
  type BattleInput,
} from '../src/model/combat';
import { RuleError } from '../src/model/types';
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

  it('kills knights first when they lead a charge', () => {
    expect(applyCasualties(army(10, 2), 4, true)).toEqual(army(10, 0));
    expect(applyCasualties(army(10, 2), 3, true)).toEqual(army(10, 1));
  });
});

describe('castleBonus', () => {
  it('is 1 without a castle and drops with catapults down to 1.5', () => {
    expect(castleBonus(false, 0)).toBe(1);
    expect(castleBonus(true, 0)).toBe(3);
    expect(castleBonus(true, 2)).toBe(2);
    expect(castleBonus(true, 10)).toBe(1.5);
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

describe('round-by-round battle', () => {
  const input: BattleInput = {
    attacker: army(40, 6, 2),
    defender: army(40),
    attackerLeadership: 3,
    defenderLeadership: 3,
    castle: true,
  };

  it('offers charge only with knights and bombard only at a castle with catapults', () => {
    expect(availableTactics(startBattle(input))).toEqual(['advance', 'charge', 'bombard', 'retreat']);
    expect(availableTactics(startBattle({ ...input, castle: false }))).toEqual(['advance', 'charge', 'retreat']);
    expect(availableTactics(startBattle({ ...input, attacker: army(40) }))).toEqual(['advance', 'retreat']);
  });

  it('reports losses each round and refuses moves after the end', () => {
    const b = startBattle(input);
    const report = fightRound(b, 'advance', new Rng(1));
    expect(b.round).toBe(1);
    expect(report.attackerLosses.soldiers + report.attackerLosses.knights).toBeGreaterThan(0);
    expect(report.defenderLosses.soldiers).toBeGreaterThan(0);
    fightRound(b, 'retreat', new Rng(1));
    expect(b.over).toBe(true);
    expect(b.attackerWon).toBe(false);
    expect(() => fightRound(b, 'advance', new Rng(1))).toThrow(RuleError);
  });

  it('charging costs knights first; bombarding draws little return fire', () => {
    const charge = fightRound(startBattle(input), 'charge', new Rng(4));
    expect(charge.attackerLosses.knights).toBeGreaterThan(0);
    expect(charge.attackerLosses.soldiers).toBe(0);

    const advance = fightRound(startBattle(input), 'advance', new Rng(4));
    const bombard = fightRound(startBattle(input), 'bombard', new Rng(4));
    expect(bombard.attackerLosses.soldiers).toBeLessThan(advance.attackerLosses.soldiers);
  });

  it('is over before it starts against an empty territory', () => {
    const b = startBattle({ ...input, defender: army(0) });
    expect(b.over).toBe(true);
    expect(b.attackerWon).toBe(true);
  });

  it('resolveBattle plays autoTactic each round', () => {
    const b = startBattle({ ...input, castle: false });
    const rng = new Rng(11);
    while (!b.over) fightRound(b, autoTactic(b), rng);
    const auto = resolveBattle({ ...input, castle: false }, new Rng(11));
    expect(auto).toEqual({ attackerWon: b.attackerWon, attacker: b.attacker, defender: b.defender, rounds: b.round });
  });
});
