import heroData from '../data/heroes.json';
import lordData from '../data/lords.json';
import { emptyArmy } from './army';
import { collectIncome, garrisonCap } from './economy';
import { TERRITORIES } from './map';
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
    gold: 10,
    army: { soldiers: 20, knights: 2, catapults: 0 },
    garrison: { soldiers: 30, knights: 3, catapults: 0 },
  },
  norman: {
    gold: 20,
    army: { soldiers: 25, knights: 5, catapults: 0 },
    garrison: { soldiers: 35, knights: 5, catapults: 0 },
  },
};

export function newGame(heroId: string, seed: number): GameState {
  const hero = HEROES.find((h) => h.id === heroId);
  if (!hero) throw new Error(`Unknown hero: ${heroId}`);

  const territories: Record<string, Territory> = {};
  for (const def of TERRITORIES) {
    territories[def.id] = {
      id: def.id,
      owner: null,
      garrison: emptyArmy(),
      castle: false,
    };
    territories[def.id].garrison.soldiers = garrisonCap(territories[def.id]);
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
      army: { ...start.army }, armyAt: home,
    };
  };

  const lords: Lord[] = [
    makeLord(lordData.player.id, hero.name, 'saxon', lordData.player.home, hero.stats, true),
    ...lordData.rivals.map((r) =>
      makeLord(r.id, r.name, r.faction as Faction, r.home, r.stats, false),
    ),
  ];

  const state: GameState = {
    version: STATE_VERSION,
    month: 2,
    year: 1149,
    lords: Object.fromEntries(lords.map((l) => [l.id, l])),
    turnOrder: lords.map((l) => l.id),
    current: 0,
    territories,
    rngState: seed >>> 0,
    status: 'playing',
    log: [],
  };
  addLog(state, 'The king is dead. Saxon and Norman lords fight for the crown.');
  collectIncome(state, lords[0].id);
  return state;
}
