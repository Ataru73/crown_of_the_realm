import { describe, expect, it } from 'vitest';
import { DEFAULT_TEMPERAMENT } from '../src/model/ai';
import { garrisonCap } from '../src/model/economy';
import { game } from './helpers';

describe('new game', () => {
  it('is the same for the same seed', () => {
    expect(game(7)).toEqual(game(7));
  });

  it('varies the rivals, their order and the neutral garrisons between seeds', () => {
    const games = [1, 2, 3, 4, 5].map((seed) => game(seed));
    const differ = (key: (s: ReturnType<typeof game>) => unknown) =>
      new Set(games.map((s) => JSON.stringify(key(s)))).size > 1;
    expect(differ((s) => s.turnOrder)).toBe(true);
    expect(differ((s) => s.lords.montclair.temperament)).toBe(true);
    expect(differ((s) => s.territories.york.garrison)).toBe(true);
  });

  it('always lets the hero move first, with the default temperament', () => {
    for (const seed of [1, 2, 3]) {
      const s = game(seed);
      expect(s.turnOrder[0]).toBe('player');
      expect(s.lords.player.temperament).toEqual(DEFAULT_TEMPERAMENT);
    }
  });

  it('keeps temperaments and garrisons close to the defaults', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const s = game(seed);
      for (const lord of Object.values(s.lords)) {
        const t = lord.temperament;
        expect(Math.abs(t.caution - DEFAULT_TEMPERAMENT.caution)).toBeLessThanOrEqual(0.1 + 1e-9);
        expect(Math.abs(t.knightShare - DEFAULT_TEMPERAMENT.knightShare)).toBeLessThanOrEqual(0.1 + 1e-9);
        expect(Math.abs(t.thrift - DEFAULT_TEMPERAMENT.thrift)).toBeLessThanOrEqual(0.05 + 1e-9);
      }
      for (const t of Object.values(s.territories)) {
        if (t.owner) continue;
        const cap = garrisonCap(t);
        expect(t.garrison.soldiers).toBeGreaterThanOrEqual(Math.floor(cap * 0.9));
        expect(t.garrison.soldiers).toBeLessThanOrEqual(Math.ceil(cap * 1.1));
      }
    }
  });
});
