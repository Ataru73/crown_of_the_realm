import { describe, expect, it } from 'vitest';
import { income, upkeep } from '../src/model/economy';
import { currentLord } from '../src/model/state';
import { dateLabel, endTurn, playTurn } from '../src/model/turn';
import { RuleError } from '../src/model/types';
import { game } from './helpers';

describe('turn loop', () => {
  it('starts in March 1149 with the player to move', () => {
    const s = game();
    expect(dateLabel(s)).toBe('March 1149');
    expect(currentLord(s).isPlayer).toBe(true);
  });

  it('pays each lord when their turn starts', () => {
    const s = game();
    const gold = s.lords.montclair.gold;
    endTurn(s);
    expect(currentLord(s).id).toBe('montclair');
    expect(s.lords.montclair.gold).toBe(
      gold + income(s, 'montclair') - upkeep(s.lords.montclair.army),
    );
  });

  it('starts a new month after every lord has moved', () => {
    const s = game();
    for (let i = 0; i < s.turnOrder.length; i++) playTurn(s, { type: 'pass' });
    expect(dateLabel(s)).toBe('April 1149');
    expect(currentLord(s).isPlayer).toBe(true);
  });

  it('rolls over the year', () => {
    const s = game();
    s.month = 11;
    s.current = s.turnOrder.length - 1;
    endTurn(s);
    expect(dateLabel(s)).toBe('January 1150');
  });

  it('skips defeated lords', () => {
    const s = game();
    s.lords.montclair.alive = false;
    endTurn(s);
    expect(currentLord(s).id).toBe('osric');
  });

  it('refuses to play once the game is over', () => {
    const s = game();
    s.status = 'lost';
    expect(() => playTurn(s, { type: 'pass' })).toThrow(RuleError);
  });
});
