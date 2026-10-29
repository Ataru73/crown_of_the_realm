import { describe, expect, it } from 'vitest';
import { playAiTurn } from '../src/model/ai';
import { newGame } from '../src/model/setup';
import type { GameState } from '../src/model/types';

const MAX_TURNS = 3000;

function checkInvariants(s: GameState): void {
  for (const lord of Object.values(s.lords)) {
    expect(lord.gold).toBeGreaterThanOrEqual(0);
    for (const n of Object.values(lord.army)) {
      expect(Number.isInteger(n) && n >= 0, `${lord.id} army ${JSON.stringify(lord.army)}`).toBe(true);
    }
    if (lord.alive) {
      expect(s.territories[lord.home].owner).toBe(lord.id);
      expect(s.territories[lord.armyAt].owner).toBe(lord.id);
    } else {
      expect(Object.values(s.territories).some((t) => t.owner === lord.id)).toBe(false);
    }
  }
  for (const t of Object.values(s.territories)) {
    if (t.owner) expect(s.lords[t.owner].alive).toBe(true);
    for (const n of Object.values(t.garrison)) expect(n).toBeGreaterThanOrEqual(0);
  }
  expect(s.lords[s.turnOrder[s.current]].alive || s.status !== 'playing').toBe(true);
}

/** Every lord, the player included, plays as the AI until the game ends. */
function simulate(seed: number, heroId = 'wulfric'): { state: GameState; turns: number } {
  const state = newGame(heroId, seed);
  let turns = 0;
  while (state.status === 'playing' && turns < MAX_TURNS) {
    playAiTurn(state);
    checkInvariants(state);
    turns++;
  }
  return { state, turns };
}

describe('headless campaign', () => {
  it('is deterministic for a seed', () => {
    expect(simulate(42).state).toEqual(simulate(42).state);
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])('seed %i plays to an end with rules intact', (seed) => {
    const { state, turns } = simulate(seed);
    expect(state.status).not.toBe('playing');
    expect(turns).toBeLessThan(MAX_TURNS);
  });

  it('works with every hero', () => {
    for (const hero of ['edwin', 'aldric', 'godwin', 'wulfric']) {
      expect(simulate(7, hero).state.status).not.toBe('playing');
    }
  });
});
