import { describe, expect, it } from 'vitest';
import {
  buildCastle,
  buy,
  collectIncome,
  garrisonCap,
  growGarrisons,
  income,
  upkeep,
} from '../src/model/economy';
import { RuleError } from '../src/model/types';
import { game } from './helpers';

describe('economy', () => {
  it('sums income of owned territories', () => {
    const s = game();
    expect(income(s, 'player')).toBe(7); // Lancaster
    s.territories.york.owner = 'player';
    expect(income(s, 'player')).toBe(13);
  });

  it('charges upkeep for the campaign army', () => {
    expect(upkeep({ soldiers: 20, knights: 5, catapults: 1 })).toBe(5);
    expect(upkeep({ soldiers: 9, knights: 0, catapults: 0 })).toBe(0);
  });

  it('buys units and refuses when gold is short', () => {
    const s = game();
    const gold = s.lords.player.gold;
    buy(s, 'player', 'knight', 2);
    expect(s.lords.player.gold).toBe(gold - 8);
    expect(s.lords.player.army.knights).toBe(4);
    expect(() => buy(s, 'player', 'catapult', 10)).toThrow(RuleError);
    expect(() => buy(s, 'player', 'soldier', 0)).toThrow(RuleError);
  });

  it('musters troops at the home castle until the army returns', () => {
    const s = game();
    const lord = s.lords.player;
    const soldiers = lord.army.soldiers;
    lord.gold = 100;
    lord.armyAt = 'york';
    buy(s, 'player', 'soldier', 10);
    expect(lord.army.soldiers).toBe(soldiers);
    expect(lord.reserve.soldiers).toBe(10);
    lord.armyAt = lord.home;
    buy(s, 'player', 'soldier', 1);
    expect(lord.army.soldiers).toBe(soldiers + 11);
    expect(lord.reserve.soldiers).toBe(0);
  });

  it('makes soldiers desert when upkeep cannot be paid', () => {
    const s = game();
    const lord = s.lords.player;
    lord.gold = 0;
    lord.army = { soldiers: 100, knights: 20, catapults: 0 };
    collectIncome(s, 'player');
    expect(lord.gold).toBe(0);
    expect(lord.army.soldiers).toBe(90);
  });

  it('grows garrisons by one a month up to the cap, doubled by a castle', () => {
    const s = game();
    const york = s.territories.york;
    york.garrison.soldiers = 0;
    growGarrisons(s);
    expect(york.garrison.soldiers).toBe(1);
    york.garrison.soldiers = garrisonCap(york);
    growGarrisons(s);
    expect(york.garrison.soldiers).toBe(garrisonCap(york));
    const capBefore = garrisonCap(york);
    york.castle = true;
    expect(garrisonCap(york)).toBe(capBefore * 2);
  });

  it('builds castles only on own land with enough gold', () => {
    const s = game();
    s.lords.player.gold = 100;
    expect(() => buildCastle(s, 'player', 'york')).toThrow(RuleError);
    expect(() => buildCastle(s, 'player', 'lancaster')).toThrow(/already/);
    s.territories.york.owner = 'player';
    buildCastle(s, 'player', 'york');
    expect(s.territories.york.castle).toBe(true);
    expect(s.lords.player.gold).toBe(80);
  });
});
