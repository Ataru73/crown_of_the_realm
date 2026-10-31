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
  /** Games lost to a Norman lord taking the hero's castle. */
  lostToNormans: number;
}

/** Plays GAMES all-AI campaigns (the player's lord too) and tallies the outcomes. */
function runBalance(): BalanceReport {
  const report: BalanceReport = { won: 0, lost: 0, unfinished: 0, averageMonths: 0, lostToNormans: 0 };
  let months = 0;
  for (let seed = 1; seed <= GAMES; seed++) {
    const state: GameState = newGame(HEROES[seed % HEROES.length].id, seed);
    for (let turn = 0; turn < MAX_TURNS && state.status === 'playing'; turn++) playAiTurn(state);
    months += (state.year - 1149) * 12 + state.month - 2;
    if (state.status === 'won') report.won++;
    else if (state.status === 'lost') {
      report.lost++;
      const captor = state.territories[state.lords.player.home].owner;
      if (captor && state.lords[captor].faction === 'norman') report.lostToNormans++;
    } else report.unfinished++;
  }
  report.averageMonths = Math.round(months / GAMES);
  return report;
}

/*
 * The player's lord is played by the same simple AI here, which plays worse
 * than a person (it leaves its castle exposed). These bounds guard against
 * regressions: stalemates, Norman blitzes, or a player who can never win.
 * Rivals' temperaments, their turn order and the neutral garrisons vary with
 * the seed, so each campaign opens differently.
 * Last measured: 18 won, 82 lost (43 to Normans, 39 to Saxon rivals), 37 months.
 */
describe('balance', () => {
  const r = runBalance();

  it(`all ${GAMES} all-AI campaigns finish`, () => {
    expect(r.unfinished).toBe(0);
  });

  it('gives the AI-played player a fair share of wins', () => {
    expect(r.won / GAMES).toBeGreaterThanOrEqual(0.15);
  });

  it('lets no side win more than 80% of games', () => {
    expect(r.lostToNormans / GAMES).toBeLessThanOrEqual(0.8);
    expect(r.won / GAMES).toBeLessThanOrEqual(0.8);
  });

  it('lasts long enough for the player to act (two years on average)', () => {
    expect(r.averageMonths).toBeGreaterThanOrEqual(24);
  });
});
