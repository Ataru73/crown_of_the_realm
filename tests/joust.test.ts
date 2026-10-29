import { describe, expect, it } from 'vitest';
import {
  lanceSway,
  MAX_PASSES,
  opponentStrike,
  recordPass,
  scoreStrike,
  startJoust,
  type Strike,
} from '../src/model/joust';
import { Rng } from '../src/model/rng';

describe('scoreStrike', () => {
  it('unhorses near the centre, glances on the rest of the shield, misses outside', () => {
    expect(scoreStrike(0, 40)).toBe('unhorse');
    expect(scoreStrike(16, 40)).toBe('unhorse');
    expect(scoreStrike(17, 40)).toBe('glance');
    expect(scoreStrike(40, 40)).toBe('glance');
    expect(scoreStrike(41, 40)).toBe('miss');
  });
});

describe('opponentStrike', () => {
  function tally(jousting: number): Record<Strike, number> {
    const counts = { unhorse: 0, glance: 0, miss: 0 };
    const rng = new Rng(jousting);
    for (let i = 0; i < 2000; i++) counts[opponentStrike(jousting, rng)]++;
    return counts;
  }

  it('unhorses more often the better the jouster', () => {
    expect(tally(5).unhorse).toBeGreaterThan(tally(1).unhorse * 2);
  });

  it('can produce every outcome', () => {
    const t = tally(3);
    expect(t.unhorse && t.glance && t.miss).toBeTruthy();
  });
});

describe('lanceSway', () => {
  it('is steadier for better jousters', () => {
    expect(lanceSway(5)).toBeLessThan(lanceSway(1));
    expect(lanceSway(5)).toBeGreaterThan(0);
  });
});

describe('recordPass', () => {
  it('ends at once when only one rider is unhorsed', () => {
    const win = startJoust();
    recordPass(win, 'unhorse', 'glance');
    expect(win).toMatchObject({ over: true, won: true, pass: 1 });

    const loss = startJoust();
    recordPass(loss, 'miss', 'unhorse');
    expect(loss).toMatchObject({ over: true, won: false });
  });

  it('rides on when both are unhorsed or neither is', () => {
    const j = startJoust();
    recordPass(j, 'unhorse', 'unhorse');
    recordPass(j, 'glance', 'miss');
    expect(j.over).toBe(false);
    expect(j).toMatchObject({ pass: 2, playerPoints: 4, opponentPoints: 3 });
  });

  it('decides on points after the last pass, ties going to the opponent', () => {
    const ahead = startJoust();
    for (let i = 0; i < MAX_PASSES; i++) recordPass(ahead, 'glance', 'miss');
    expect(ahead).toMatchObject({ over: true, won: true });

    const tie = startJoust();
    for (let i = 0; i < MAX_PASSES; i++) recordPass(tie, 'glance', 'glance');
    expect(tie).toMatchObject({ over: true, won: false });

    expect(() => recordPass(tie, 'glance', 'glance')).toThrow();
  });
});
