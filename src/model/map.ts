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

/**
 * The territory a step from `from` in direction (dx, dy) on the map, for
 * keyboard selection: the nearest one within 60° of that direction, favouring
 * the straightest. Null at the edge of the map.
 */
export function territoryInDirection(from: TerritoryId, dx: number, dy: number): TerritoryId | null {
  const origin = territoryDef(from);
  const len = Math.hypot(dx, dy);
  let best: TerritoryId | null = null;
  let bestScore = Infinity;
  for (const t of TERRITORIES) {
    const vx = t.x - origin.x;
    const vy = t.y - origin.y;
    const dist = Math.hypot(vx, vy);
    if (dist === 0) continue;
    const cos = (vx * dx + vy * dy) / (dist * len);
    if (cos < 0.5) continue;
    const score = dist * (2 - cos);
    if (score < bestScore) {
      bestScore = score;
      best = t.id;
    }
  }
  return best;
}
