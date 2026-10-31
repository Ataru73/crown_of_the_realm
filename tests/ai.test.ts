import { describe, expect, it } from 'vitest';
import { chooseAiAction, homeThreatened } from '../src/model/ai';
import { Rng } from '../src/model/rng';
import { game } from './helpers';

describe('AI', () => {
  it('goes for a beatable enemy castle first', () => {
    const s = game();
    s.territories.cumbria.owner = 'osric';
    s.lords.osric.army = { soldiers: 300, knights: 20, catapults: 0 };
    s.territories.lancaster.garrison = { soldiers: 5, knights: 0, catapults: 0 };
    s.lords.player.armyAt = 'lancaster';
    s.lords.player.army = { soldiers: 1, knights: 0, catapults: 0 };
    expect(chooseAiAction(s, 'osric', new Rng(1))).toEqual({ type: 'conquer', target: 'lancaster' });
  });

  it('prefers land held by the other faction', () => {
    const s = game();
    s.lords.aubigny.army = { soldiers: 300, knights: 0, catapults: 0 };
    // Both neighbours equally rich and defended; one Saxon, one neutral.
    for (const id of ['lincoln', 'essex']) s.territories[id].garrison = { soldiers: 10, knights: 0, catapults: 0 };
    s.territories.lincoln.owner = 'osric';
    // Essex is still a fair target, so it is picked sometimes, but Lincoln most often.
    const picks = { lincoln: 0, essex: 0 } as Record<string, number>;
    const rng = new Rng(1);
    for (let i = 0; i < 200; i++) {
      const action = chooseAiAction(s, 'aubigny', rng);
      if (action.type === 'conquer') picks[action.target] += 1;
    }
    expect(picks.lincoln + picks.essex).toBe(200);
    expect(picks.lincoln).toBeGreaterThan(picks.essex);
  });

  it('varies its target among the near-best, never weak ones', () => {
    const s = game();
    s.lords.aubigny.army = { soldiers: 300, knights: 0, catapults: 0 };
    // Lincoln and Leicester are equally rich and defended; Essex is far better guarded.
    for (const id of ['lincoln', 'leicester']) s.territories[id].garrison = { soldiers: 10, knights: 0, catapults: 0 };
    s.territories.essex.garrison = { soldiers: 100, knights: 0, catapults: 0 };
    const targets = new Set<string>();
    const rng = new Rng(2);
    for (let i = 0; i < 100; i++) {
      const action = chooseAiAction(s, 'aubigny', rng);
      if (action.type === 'conquer') targets.add(action.target);
    }
    expect([...targets].sort()).toEqual(['leicester', 'lincoln']);
  });

  it('notices a strong enemy army near home and marches back', () => {
    const s = game();
    // The player's army is away in York; a big Norman army sits in Derby, next to Lancaster.
    s.territories.york.owner = 'player';
    s.lords.player.armyAt = 'york';
    s.territories.derby.owner = 'aubigny';
    s.lords.aubigny.armyAt = 'derby';
    s.lords.aubigny.army = { soldiers: 400, knights: 40, catapults: 4 };
    expect(homeThreatened(s, 'player')).toBe(true);
    expect(chooseAiAction(s, 'player', new Rng(1))).toEqual({ type: 'march', target: 'lancaster' });
  });

  it('is not alarmed by weak or distant armies', () => {
    const s = game();
    expect(homeThreatened(s, 'player')).toBe(false);
  });
});
