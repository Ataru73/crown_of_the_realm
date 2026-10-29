import data from '../data/territories.json';
import type { TerritoryId } from './types';

export interface TerritoryDef {
  id: TerritoryId;
  name: string;
  /** Position on the 640x400 campaign map. */
  x: number;
  y: number;
  /** Gold per month for the owner. */
  income: number;
}

export const TERRITORIES: readonly TerritoryDef[] = data.territories;

const byId = new Map(TERRITORIES.map((t) => [t.id, t]));

const adjacency = new Map<TerritoryId, TerritoryId[]>(TERRITORIES.map((t) => [t.id, []]));
for (const [a, b] of data.borders) {
  adjacency.get(a)!.push(b);
  adjacency.get(b)!.push(a);
}

export function territoryDef(id: TerritoryId): TerritoryDef {
  const def = byId.get(id);
  if (!def) throw new Error(`Unknown territory: ${id}`);
  return def;
}

export function neighbours(id: TerritoryId): readonly TerritoryId[] {
  const list = adjacency.get(id);
  if (!list) throw new Error(`Unknown territory: ${id}`);
  return list;
}

export function areAdjacent(a: TerritoryId, b: TerritoryId): boolean {
  return neighbours(a).includes(b);
}

/** Raw border list, for validation in tests. */
export const BORDERS: readonly (readonly string[])[] = data.borders;
