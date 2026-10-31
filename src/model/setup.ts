import heroData from '../data/heroes.json';
import lordData from '../data/lords.json';
import { DEFAULT_TEMPERAMENT, rollTemperament } from './ai';
import { emptyArmy } from './army';
import { collectIncome, garrisonCap } from './economy';
import { TERRITORIES } from './map';
import { Rng } from './rng';
import { addLog, STATE_VERSION } from './state';
import type { Army, Faction, GameState, Lord, Stats, Territory } from './types';

export interface Hero {
  id: string;
  name: string;
  stats: Stats;
}

export const HEROES: readonly Hero[] = heroData.heroes;

const START: Record<Faction, { gold: number; army: Army; garrison: Army }> = {
  saxon: {
    gold: 40,
    army: { soldiers: 20, knights: 2, catapults: 0 },
    garrison: { soldiers: 30, knights: 3, catapults: 0 },
  },
  norman: {
    gold: 15,
    army: { soldiers: 22, knights: 4, catapults: 0 },
    garrison: { soldiers: 35, knights: 5, catapults: 0 },
  },
};

/** Neutral garrisons start up to this share above or below their cap, so the first conquests differ from game to game. */
const START_GARRISON_SPREAD = 0.1;

export function newGame(heroId: string, seed: number): GameState {
  const hero = HEROES.find((h) => h.id === heroId);
  if (!hero) throw new Error(`Unknown hero: ${heroId}`);
  const rng = new Rng(seed);

  const territories: Record<string, Territory> = {};
  for (const def of TERRITORIES) {
    territories[def.id] = {
      id: def.id,
      owner: null,
      garrison: emptyArmy(),
      castle: false,
    };
    const share = 1 + (rng.next() * 2 - 1) * START_GARRISON_SPREAD;
    territories[def.id].garrison.soldiers = Math.round(garrisonCap(territories[def.id]) * share);
  }

  const makeLord = (
    id: string,
    name: string,
    faction: Faction,
    home: string,
    stats: Stats,
    isPlayer: boolean,
  ): Lord => {
    const start = START[faction];
    territories[home].owner = id;
    territories[home].castle = true;
    territories[home].garrison = { ...start.garrison };
    return {
      id, name, faction, isPlayer, stats: { ...stats },
      fame: 0, gold: start.gold, home, alive: true,
      army: { ...start.army }, armyAt: home, reserve: { soldiers: 0, knights: 0, catapults: 0 },
      // The hero's temperament only matters when the AI plays them (in the balance simulation).
      temperament: isPlayer ? { ...DEFAULT_TEMPERAMENT } : rollTemperament(rng),
    };
  };

  // The hero always moves first; the rivals follow in a random order.
  const rivals = lordData.rivals.map((r) =>
    makeLord(r.id, r.name, r.faction as Faction, r.home, r.stats, false),
  );
  for (let i = rivals.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [rivals[i], rivals[j]] = [rivals[j], rivals[i]];
  }
  const lords: Lord[] = [
    makeLord(lordData.player.id, hero.name, 'saxon', lordData.player.home, hero.stats, true),
    ...rivals,
  ];

  const state: GameState = {
    version: STATE_VERSION,
    month: 2,
    year: 1149,
    lords: Object.fromEntries(lords.map((l) => [l.id, l])),
    turnOrder: lords.map((l) => l.id),
    current: 0,
    territories,
    rngState: rng.state,
    status: 'playing',
    log: [],
    kidnap: null,
    ladiesTaken: [],
    wife: null,
  };
  addLog(state, 'The king is dead. Saxon and Norman lords fight for the crown.');
  collectIncome(state, lords[0].id);
  return state;
}
