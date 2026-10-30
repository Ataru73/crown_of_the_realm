import { describe, expect, it } from 'vitest';
import {
  applyRescue,
  CAPTIVE_MONTHS,
  DOWRY,
  LADIES,
  monthIndex,
  monthlyEvents,
  WEDDING_DOWRY,
} from '../src/model/events';
import { Rng } from '../src/model/rng';
import { playTurn } from '../src/model/turn';
import { RuleError, type GameState } from '../src/model/types';
import { game } from './helpers';

/** Runs month starts until a lady is carried off. */
function kidnapped(seed = 1): GameState {
  const s = game(seed);
  const rng = new Rng(seed);
  for (let i = 0; i < 500 && !s.kidnap; i++) monthlyEvents(s, rng);
  if (!s.kidnap) throw new Error('No kidnap happened');
  return s;
}

describe('kidnap event', () => {
  it('has a Norman carry off a lady', () => {
    const s = kidnapped();
    expect(LADIES).toContain(s.kidnap!.lady);
    expect(s.lords[s.kidnap!.captor].faction).toBe('norman');
    expect(s.ladiesTaken).toEqual([s.kidnap!.lady]);
    expect(s.log.at(-1)).toMatch(/carried off/);
  });

  it('takes each lady at most once', () => {
    const s = game(2);
    const rng = new Rng(2);
    for (let i = 0; i < 2000; i++) {
      monthlyEvents(s, rng);
      s.kidnap = null;
    }
    expect([...s.ladiesTaken].sort()).toEqual([...LADIES].sort());
  });

  it('weds her to the captor if no one comes', () => {
    const s = kidnapped();
    const captor = s.lords[s.kidnap!.captor];
    const fame = captor.fame;
    s.month += CAPTIVE_MONTHS; // month index only matters as a difference
    expect(monthIndex(s) - s.kidnap!.since).toBe(CAPTIVE_MONTHS);
    monthlyEvents(s, new Rng(1));
    expect(s.kidnap).toBeNull();
    expect(captor.fame).toBe(fame + 1);
  });

  it('frees her when the captor falls', () => {
    const s = kidnapped();
    s.lords[s.kidnap!.captor].alive = false;
    monthlyEvents(s, new Rng(1));
    expect(s.kidnap).toBeNull();
    expect(s.log.at(-1)).toMatch(/escapes/);
  });
});

describe('rescue', () => {
  it('weds the first lady rescued, then pays a dowry for the next', () => {
    const s = kidnapped();
    const lady = s.kidnap!.lady;
    const gold = s.lords.player.gold;
    applyRescue(s, 'player', true);
    expect(s.kidnap).toBeNull();
    expect(s.wife).toBe(lady);
    expect(s.lords.player.gold).toBe(gold + WEDDING_DOWRY);
    expect(s.lords.player.fame).toBe(3);

    s.kidnap = { lady: 'Lady Edith', captor: 'montclair', since: monthIndex(s) };
    applyRescue(s, 'player', true);
    expect(s.wife).toBe(lady);
    expect(s.lords.player.gold).toBe(gold + WEDDING_DOWRY + DOWRY);
  });

  it('costs soldiers on failure and she stays captive', () => {
    const s = kidnapped();
    s.lords.player.army.soldiers = 20;
    applyRescue(s, 'player', false);
    expect(s.kidnap).not.toBeNull();
    expect(s.lords.player.army.soldiers).toBe(16);
  });

  it('needs a captive lady and the hero', () => {
    const s = game();
    expect(() => playTurn(s, { type: 'rescue', won: true })).toThrow(RuleError);
    const k = kidnapped();
    expect(() => applyRescue(k, k.kidnap!.captor, true)).toThrow(RuleError);
  });

  it('is a turn action', () => {
    const s = kidnapped();
    s.current = 0;
    const r = playTurn(s, { type: 'rescue', won: true });
    expect(r.won).toBe(true);
    expect(r.messages.join(' ')).toMatch(/rescues/);
  });
});
