import { describe, expect, it } from 'vitest';
import { playAiTurn } from '../src/model/ai';
import { HEROES, newGame } from '../src/model/setup';
import type { GameState } from '../src/model/types';

const GAMES = 100;
const MAX_TURNS = 3000;

interface BalanceReport {
  won: number;
  lost: number;
  unfinished: number;
  averageMonths: number;
  normanLordsLeftWhenLost: number;
}

/** Plays GAMES all-AI campaigns (the player's lord too) and tallies the outcomes. */
function runBalance(): BalanceReport {
  const report: BalanceReport = { won: 0, lost: 0, unfinished: 0, averageMonths: 0, normanLordsLeftWhenLost: 0 };
  let months = 0;
  for (let seed = 1; seed <= GAMES; seed++) {
    const state: GameState = newGame(HEROES[seed % HEROES.length].id, seed);
    for (let turn = 0; turn < MAX_TURNS && state.status === 'playing'; turn++) playAiTurn(state);
    months += (state.year - 1149) * 12 + state.month - 2;
    if (state.status === 'won') report.won++;
    else if (state.status === 'lost') {
      report.lost++;
      report.normanLordsLeftWhenLost += Object.values(state.lords).filter(
        (l) => l.alive && l.faction === 'norman',
      ).length;
    } else report.unfinished++;
  }
  report.averageMonths = Math.round(months / GAMES);
  return report;
}

/*
 * The player's lord is played by the same simple AI here, which plays far
 * worse than a person (it leaves its castle exposed), so it mostly loses.
 * These bounds guard against regressions: stalemates, Norman blitzes,
 * or a player who can never win. Last measured: 9 won, 91 lost, 35 months.
 */
describe('balance', () => {
  const r = runBalance();

  it(`all ${GAMES} all-AI campaigns finish`, () => {
    expect(r.unfinished).toBe(0);
  });

  it('gives the AI-played player some wins', () => {
    expect(r.won / GAMES).toBeGreaterThanOrEqual(0.05);
  });

  it('lasts long enough for the player to act (two years on average)', () => {
    expect(r.averageMonths).toBeGreaterThanOrEqual(24);
  });
});
