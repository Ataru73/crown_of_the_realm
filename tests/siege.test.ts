import { describe, expect, it } from 'vitest';
import { startBattle, type BattleInput } from '../src/model/combat';
import { Rng } from '../src/model/rng';
import {
  applySiege,
  chargePower,
  CHARGE_CYCLE_MS,
  endSiege,
  fire,
  firePotsFor,
  IMPACT_MS,
  MAX_DISTANCE,
  MIN_DISTANCE,
  release,
  ROW_HP,
  selectAmmo,
  setAngle,
  siegeResult,
  standingRows,
  startCharge,
  startSiege,
  stonesFor,
  tickSiege,
  wallDamage,
  type Siege,
  type SiegeEvent,
} from '../src/model/siege';

const STEP = 16;

/** Throws at `power` in still air and flies the shot until it lands; returns the landing event. */
function throwAt(s: Siege, power: number, rng: Rng): SiegeEvent {
  s.wind = 0;
  expect(fire(s, power)).toBe(true);
  for (let t = 0; t < 20000 && s.phase === 'flight'; t += STEP) tickSiege(s, STEP, rng);
  expect(s.phase).toBe('impact');
  return s.events.at(-1)!;
}

/** Copies of the siege thrown at increasing powers until one lands as `type`; returns that power. */
function findPower(s: Siege, type: SiegeEvent['type'], rng: Rng): number {
  for (let p = 0; p <= 1; p += 0.005) {
    const trial = structuredClone(s);
    if (throwAt(trial, p, rng).type === type) return p;
  }
  throw new Error(`No power lands ${type}`);
}

/** Waits out the impact pause so the next shot can be aimed. */
function settle(s: Siege, rng: Rng): void {
  tickSiege(s, IMPACT_MS + 1, rng);
}

describe('starting a siege', () => {
  it('gives more shots with more catapults, up to a cap', () => {
    expect(stonesFor(1)).toBeLessThan(stonesFor(3));
    expect(stonesFor(20)).toBe(stonesFor(3));
    expect(firePotsFor(1)).toBe(1);
    expect(firePotsFor(10)).toBe(3);
  });

  it('places the wall within range and needs a catapult', () => {
    const s = startSiege(2, new Rng(5));
    expect(s.distance).toBeGreaterThanOrEqual(MIN_DISTANCE);
    expect(s.distance).toBeLessThanOrEqual(MAX_DISTANCE);
    expect(s.stones).toBe(stonesFor(2));
    expect(wallDamage(s)).toBe(0);
    expect(() => startSiege(0, new Rng(1))).toThrow();
  });
});

describe('aiming', () => {
  it('clamps the angle', () => {
    const s = startSiege(1, new Rng(1));
    setAngle(s, 5);
    expect(s.angle).toBe(15);
    setAngle(s, 90);
    expect(s.angle).toBe(75);
  });

  it('swings the power meter up and back down while charging', () => {
    expect(chargePower(0)).toBe(0);
    expect(chargePower(CHARGE_CYCLE_MS / 2)).toBe(1);
    expect(chargePower(CHARGE_CYCLE_MS / 4)).toBeCloseTo(0.5);
    expect(chargePower(CHARGE_CYCLE_MS * 0.75)).toBeCloseTo(0.5);

    const rng = new Rng(1);
    const s = startSiege(1, rng);
    expect(startCharge(s)).toBe(true);
    tickSiege(s, CHARGE_CYCLE_MS / 4, rng);
    expect(s.power).toBeCloseTo(0.5);
    expect(release(s)).toBe(true);
    expect(s.phase).toBe('flight');
    expect(s.stones).toBe(stonesFor(1) - 1);
  });

  it('only switches to ammunition that is left', () => {
    const s = startSiege(1, new Rng(1));
    expect(selectAmmo(s, 'fire')).toBe(true);
    s.fire = 0;
    expect(selectAmmo(s, 'stone')).toBe(true);
    expect(selectAmmo(s, 'fire')).toBe(false);
  });
});

describe('shots', () => {
  it('fall short, strike the wall or clear it as the power rises', () => {
    const rng = new Rng(3);
    const s = startSiege(1, rng);
    expect(throwAt(structuredClone(s), 0, rng).type).toBe('short');
    const wall = findPower(s, 'wall', rng);
    const yard = findPower(s, 'yard', rng);
    const long = findPower(s, 'long', rng);
    expect(wall).toBeLessThan(yard);
    expect(yard).toBeLessThan(long);
  });

  it('are carried by the wind', () => {
    const rng = new Rng(3);
    const calm = startSiege(1, rng);
    const breezy = structuredClone(calm);
    fire(calm, 0.6);
    fire(breezy, 0.6);
    breezy.wind = 1.5;
    for (let i = 0; i < 60; i++) {
      tickSiege(calm, STEP, rng);
      tickSiege(breezy, STEP, rng);
    }
    expect(breezy.shot!.x).toBeGreaterThan(calm.shot!.x);
  });

  it('knock courses out of the wall, and those above a broken course fall with it', () => {
    const rng = new Rng(3);
    const s = startSiege(3, rng);
    s.angle = 20;
    const power = findPower(s, 'wall', rng);
    const e = throwAt(s, power, rng);
    expect(e).toMatchObject({ type: 'wall', row: 0, damage: 1, collapsed: false });
    expect(wallDamage(s)).toBeGreaterThan(0);

    s.rows[0] = 1;
    settle(s, rng);
    expect(throwAt(s, power, rng)).toMatchObject({ type: 'wall', row: 0, collapsed: true });
    expect(standingRows(s)).toBe(0);
    expect(wallDamage(s)).toBe(1);
  });

  it('only count the courses still standing', () => {
    const s = startSiege(1, new Rng(1));
    s.rows = [ROW_HP[0], 0, 0, 0];
    expect(standingRows(s)).toBe(1);
    expect(wallDamage(s)).toBeCloseTo(1 - ROW_HP[0] / ROW_HP.reduce((a, b) => a + b));
  });

  it('do no harm to the wall with fire, but fire in the bailey burns the defenders', () => {
    const rng = new Rng(3);
    const s = startSiege(1, rng);
    selectAmmo(s, 'fire');
    expect(throwAt(structuredClone(s), findPower(s, 'wall', rng), rng)).toMatchObject({ damage: 0 });
    expect(throwAt(s, findPower(s, 'yard', rng), rng).type).toBe('yard');
    expect(s.fireHits).toBe(1);
  });
});

describe('ending a siege', () => {
  it('ends when the ammunition runs out, switching to what is left', () => {
    const rng = new Rng(4);
    const s = startSiege(1, rng);
    const shots = s.stones + s.fire;
    for (let i = 0; i < shots; i++) {
      throwAt(s, 0, rng);
      settle(s, rng);
    }
    expect(s.phase).toBe('over');
    expect(s.events.at(-1)).toEqual({ type: 'over' });
    expect(fire(s, 0.5)).toBe(false);
  });

  it('can be called off early to storm the walls', () => {
    const s = startSiege(2, new Rng(1));
    endSiege(s);
    expect(s.phase).toBe('over');
    expect(startCharge(s)).toBe(false);
  });

  it('weakens the assault: lower walls and fewer defenders', () => {
    const input: BattleInput = {
      attacker: { soldiers: 30, knights: 2, catapults: 1 },
      defender: { soldiers: 40, knights: 2, catapults: 0 },
      attackerLeadership: 3,
      defenderLeadership: 3,
      castle: true,
    };
    const after = applySiege(input, { wallDamage: 1, fireHits: 2 });
    expect(after.defender.soldiers).toBe(Math.floor(40 * 0.85 * 0.85));
    expect(after.defender.knights).toBe(2);
    expect(startBattle(after).bonus).toBe(1);
    expect(startBattle(input).bonus).toBe(2.5);
    expect(startBattle(applySiege(input, { wallDamage: 0, fireHits: 0 })).bonus).toBe(3);
    expect(siegeResult(startSiege(1, new Rng(1)))).toEqual({ wallDamage: 0, fireHits: 0 });
  });
});
