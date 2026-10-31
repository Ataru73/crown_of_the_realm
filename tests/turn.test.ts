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
    const next = s.turnOrder[1];
    const gold = s.lords[next].gold;
    endTurn(s);
    expect(currentLord(s).id).toBe(next);
    expect(s.lords[next].gold).toBe(gold + income(s, next) - upkeep(s.lords[next].army));
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

  it('reports the messages written during the turn and keeps the log bounded', () => {
    const s = game();
    s.log = Array.from({ length: 100 }, (_, i) => `old ${i}`);
    s.lords.player.army = { soldiers: 200, knights: 20, catapults: 0 };
    const result = playTurn(s, { type: 'conquer', target: 'cumbria' });
    expect(result.lordId).toBe('player');
    expect(result.messages).toEqual([`${s.lords.player.name} conquers Cumbria.`]);
    expect(s.log).toHaveLength(100);
    expect(s.log.at(-1)).toBe(result.messages[0]);
  });

  it('refuses to play once the game is over', () => {
    const s = game();
    s.status = 'lost';
    expect(() => playTurn(s, { type: 'pass' })).toThrow(RuleError);
  });
});
