import { describe, expect, it } from 'vitest';
import { areAdjacent, BORDERS, neighbours, TERRITORIES } from '../src/model/map';

describe('map', () => {
  const ids = TERRITORIES.map((t) => t.id);

  it('has 18 uniquely named territories inside the 640x400 map', () => {
    expect(ids).toHaveLength(18);
    expect(new Set(ids).size).toBe(18);
    for (const t of TERRITORIES) {
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.x).toBeLessThanOrEqual(462); // left of the map scene's side panel
      expect(t.y).toBeGreaterThanOrEqual(0);
      expect(t.y).toBeLessThanOrEqual(400);
      expect(t.income).toBeGreaterThan(0);
    }
  });

  it('has valid, non-duplicate borders', () => {
    const seen = new Set<string>();
    for (const [a, b] of BORDERS) {
      expect(ids).toContain(a);
      expect(ids).toContain(b);
      expect(a).not.toBe(b);
      const key = [a, b].sort().join('|');
      expect(seen.has(key), `duplicate border ${key}`).toBe(false);
      seen.add(key);
    }
  });

  it('is symmetric', () => {
    expect(areAdjacent('kent', 'sussex')).toBe(true);
    expect(areAdjacent('sussex', 'kent')).toBe(true);
    expect(areAdjacent('kent', 'cornwall')).toBe(false);
  });

  it('is fully connected', () => {
    const reached = new Set([ids[0]]);
    const queue = [ids[0]];
    while (queue.length) {
      for (const n of neighbours(queue.shift()!)) {
        if (!reached.has(n)) {
          reached.add(n);
          queue.push(n);
        }
      }
    }
    expect(reached.size).toBe(ids.length);
  });
});
