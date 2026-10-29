import { describe, expect, it } from 'vitest';
import {
  applyRaid,
  applyTournament,
  attackableTerritories,
  battleInput,
  conquer,
  joustChance,
  march,
  marchableTerritories,
} from '../src/model/actions';
import { neighbours } from '../src/model/map';
import { Rng } from '../src/model/rng';
import { RuleError } from '../src/model/types';
import { game } from './helpers';

describe('attackableTerritories', () => {
  it('starts as the neighbours of home', () => {
    const s = game();
    expect(attackableTerritories(s, 'player').sort()).toEqual([...neighbours('lancaster')].sort());
  });

  it('reaches past connected own land', () => {
    const s = game();
    s.territories.chester.owner = 'player';
    expect(attackableTerritories(s, 'player')).toContain('hereford');
  });

  it('is empty without an army', () => {
    const s = game();
    s.lords.player.army = { soldiers: 0, knights: 0, catapults: 0 };
    expect(attackableTerritories(s, 'player')).toEqual([]);
  });
});

describe('conquer', () => {
  it('takes a weak neutral territory and moves the army in', () => {
    const s = game();
    s.lords.player.army = { soldiers: 100, knights: 10, catapults: 0 };
    const r = conquer(s, 'player', 'cumbria', new Rng(1));
    expect(r.attackerWon).toBe(true);
    expect(s.territories.cumbria.owner).toBe('player');
    expect(s.lords.player.armyAt).toBe('cumbria');
    expect(s.lords.player.fame).toBe(1);
  });

  it('rejects unreachable targets', () => {
    const s = game();
    expect(() => conquer(s, 'player', 'kent', new Rng(1))).toThrow(RuleError);
  });

  it('eliminates a lord whose home falls: the winner takes the gold, the rest of the land revolts', () => {
    const s = game();
    s.territories.york.owner = 'osric';
    s.lords.osric.gold = 30;
    s.lords.osric.armyAt = 'york';
    s.territories.northumbria.garrison = { soldiers: 1, knights: 0, catapults: 0 };
    s.territories.cumbria.owner = 'player';
    s.lords.player.army = { soldiers: 200, knights: 20, catapults: 4 };
    const goldBefore = s.lords.player.gold;

    conquer(s, 'player', 'northumbria', new Rng(1));

    expect(s.lords.osric.alive).toBe(false);
    expect(s.territories.northumbria.owner).toBe('player');
    expect(s.territories.york.owner).toBeNull();
    expect(s.lords.player.gold).toBe(goldBefore + 30);
  });

  it('wins the game when the last Norman falls, and loses it when the player falls', () => {
    const won = game();
    won.lords.montclair.alive = false;
    won.lords.vesci.alive = false;
    won.territories.lincoln.owner = 'player';
    won.territories.derby.owner = 'player';
    won.territories.norfolk.garrison = { soldiers: 0, knights: 0, catapults: 0 };
    won.lords.aubigny.armyAt = 'norfolk';
    won.lords.aubigny.army = { soldiers: 0, knights: 0, catapults: 0 };
    conquer(won, 'player', 'norfolk', new Rng(1));
    expect(won.status).toBe('won');

    const lost = game();
    lost.territories.lancaster.garrison = { soldiers: 0, knights: 0, catapults: 0 };
    lost.lords.player.army = { soldiers: 0, knights: 0, catapults: 0 };
    lost.territories.cumbria.owner = 'osric';
    conquer(lost, 'osric', 'lancaster', new Rng(1));
    expect(lost.status).toBe('lost');
  });
});

describe('conquer with a battle fought on screen', () => {
  it('applies the given result instead of rolling a new battle', () => {
    const s = game();
    const input = battleInput(s, 'player', 'cumbria');
    const result = { attackerWon: true, attacker: { ...input.attacker, soldiers: 1 }, defender: input.defender, rounds: 7 };
    const rngState = new Rng(1).state;
    const rng = new Rng(1);
    expect(conquer(s, 'player', 'cumbria', rng, result)).toBe(result);
    expect(rng.state).toBe(rngState);
    expect(s.territories.cumbria.owner).toBe('player');
    expect(s.lords.player.army.soldiers).toBe(1);
  });
});

describe('march', () => {
  it('moves the army through connected own land only', () => {
    const s = game();
    s.territories.cumbria.owner = 'player';
    s.territories.york.owner = 'player';
    s.territories.lincoln.owner = 'player';
    s.territories.chester.owner = 'player';
    s.territories.hereford.owner = 'leofric';
    expect(marchableTerritories(s, 'player').sort()).toEqual(['chester', 'cumbria', 'lincoln', 'york']);
    march(s, 'player', 'lincoln');
    expect(s.lords.player.armyAt).toBe('lincoln');
    expect(() => march(s, 'player', 'kent')).toThrow(RuleError);
  });
});

describe('tournament', () => {
  it('favours the better jouster', () => {
    const s = game();
    s.lords.player.stats.jousting = 5;
    s.lords.osric.stats.jousting = 1;
    expect(joustChance(s, 'player', 'osric')).toBe(0.9);
    expect(joustChance(s, 'osric', 'player')).toBe(0.1);
  });

  it('jousting for land takes a non-home territory from the loser', () => {
    const s = game();
    s.territories.york.owner = 'osric';
    applyTournament(s, 'player', 'osric', 'land', true, new Rng(1));
    expect(s.territories.york.owner).toBe('player');
    expect(s.territories.northumbria.owner).toBe('osric');
  });

  it('never takes the loser home', () => {
    const s = game();
    applyTournament(s, 'player', 'osric', 'land', true, new Rng(1));
    expect(s.territories.northumbria.owner).toBe('osric');
    expect(s.lords.player.fame).toBe(1);
  });

  it('rejects dead or self opponents', () => {
    const s = game();
    expect(() => applyTournament(s, 'player', 'player', 'fame', true, new Rng(1))).toThrow(RuleError);
    s.lords.osric.alive = false;
    expect(() => applyTournament(s, 'player', 'osric', 'fame', true, new Rng(1))).toThrow(RuleError);
  });
});

describe('raid', () => {
  it('steals half the target gold on success', () => {
    const s = game();
    s.lords.montclair.gold = 41;
    const gold = s.lords.player.gold;
    expect(applyRaid(s, 'player', 'montclair', true)).toBe(20);
    expect(s.lords.montclair.gold).toBe(21);
    expect(s.lords.player.gold).toBe(gold + 20);
  });

  it('costs a fifth of the soldiers on failure', () => {
    const s = game();
    s.lords.player.army.soldiers = 20;
    expect(applyRaid(s, 'player', 'montclair', false)).toBe(0);
    expect(s.lords.player.army.soldiers).toBe(16);
  });
});
