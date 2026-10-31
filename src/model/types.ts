export type LordId = string;
export type TerritoryId = string;
export type Faction = 'saxon' | 'norman';

export interface Army {
  soldiers: number;
  knights: number;
  catapults: number;
}

/** Hero/lord skills, each 1 (poor) to 5 (excellent). */
export interface Stats {
  leadership: number;
  jousting: number;
  swordplay: number;
}

/** How an AI lord plays; rolled at the start of each game so rivals differ from one game to the next. */
export interface Temperament {
  /** How many times stronger than the defenders (after walls) the lord wants to be before attacking. */
  caution: number;
  /** Share of the gold spent on knights rather than soldiers. */
  knightShare: number;
  /** Gold saved, as a share of the army's strength, before marching home to spend it. */
  thrift: number;
}

export interface Lord {
  id: LordId;
  name: string;
  faction: Faction;
  isPlayer: boolean;
  stats: Stats;
  fame: number;
  gold: number;
  /** Territory holding the lord's home castle. Losing it eliminates the lord. */
  home: TerritoryId;
  alive: boolean;
  /** The campaign army, which marches and attacks. */
  army: Army;
  armyAt: TerritoryId;
  /**
   * Troops bought but not yet with the campaign army: the garrison of the home
   * castle. They join the army when it stands at home.
   */
  reserve: Army;
  temperament: Temperament;
}

export interface Territory {
  id: TerritoryId;
  owner: LordId | null;
  /** Vassal troops defending the territory; they don't march. */
  garrison: Army;
  castle: boolean;
}

export type GameStatus = 'playing' | 'won' | 'lost';

/** A Saxon lady held in a Norman castle, waiting to be rescued. */
export interface Kidnap {
  lady: string;
  captor: LordId;
  /** Month index (year * 12 + month) she was carried off. */
  since: number;
}

export interface GameState {
  version: number;
  /** 0 = January. */
  month: number;
  year: number;
  lords: Record<LordId, Lord>;
  turnOrder: LordId[];
  /** Index into turnOrder of the lord whose turn it is. */
  current: number;
  territories: Record<TerritoryId, Territory>;
  rngState: number;
  status: GameStatus;
  log: string[];
  kidnap: Kidnap | null;
  /** Ladies already carried off; each is taken at most once. */
  ladiesTaken: string[];
  /** The lady the hero married after rescuing her. */
  wife: string | null;
}

export type MinigameKind = 'joust' | 'sword' | 'siege' | 'battle';

/** What a minigame scene hands back to the campaign map. */
export interface MinigameResult {
  kind: MinigameKind;
  outcome: 'win' | 'lose';
  /** Gold gained (raid) or lost; 0 when not relevant. */
  gold: number;
  /** Fame gained or lost. */
  fame: number;
}

/** Thrown when an action breaks the rules (not enough gold, target not reachable...). */
export class RuleError extends Error {
  override name = 'RuleError';
}
