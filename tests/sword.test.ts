import { describe, expect, it } from 'vitest';
import { Rng } from '../src/model/rng';
import {
  blockChance,
  ENTER_MS,
  heroHp,
  parry,
  parryMs,
  startFight,
  strike,
  SWING_MS,
  tickFight,
  windupMs,
  type Fight,
} from '../src/model/sword';

const STEP = 10;

/** Ticks until `until` holds (or `ms` runs out); returns whether it held. */
function run(f: Fight, rng: Rng, ms: number, until: (f: Fight) => boolean = () => false): boolean {
  for (let t = 0; t < ms; t += STEP) {
    if (until(f)) return true;
    tickFight(f, STEP, rng);
  }
  return until(f);
}

const types = (f: Fight) => f.events.map((e) => e.type);

describe('sword fight timings', () => {
  it('scales with skill', () => {
    expect(windupMs(5)).toBeLessThan(windupMs(1));
    expect(windupMs(5)).toBeGreaterThan(SWING_MS);
    expect(parryMs(5)).toBeGreaterThan(parryMs(1));
    expect(blockChance(5)).toBeGreaterThan(blockChance(1));
    expect(heroHp(5)).toBeGreaterThan(heroHp(1));
  });
});

describe('a guard', () => {
  it('cannot be fought while he steps in', () => {
    const f = startFight(3, 3, [2]);
    expect(strike(f)).toBe(false);
    run(f, new Rng(1), ENTER_MS + STEP);
    expect(f.guard.phase).toBe('ready');
    expect(strike(f)).toBe(true);
  });

  it('wounds a hero who does nothing', () => {
    const f = startFight(3, 3, [2]);
    run(f, new Rng(1), 5000, (x) => x.heroHp < x.heroMaxHp);
    expect(types(f)).toContain('windup');
    expect(types(f)).toContain('wounded');
  });

  it('is staggered by a parry raised just before his blow', () => {
    const rng = new Rng(2);
    const f = startFight(3, 3, [2]);
    run(f, rng, 5000, (x) => x.guard.phase === 'windup' && x.guard.timer <= x.parryMs / 2);
    expect(parry(f)).toBe(true);
    run(f, rng, 500, (x) => x.guard.phase === 'stagger');
    expect(f.guard.phase).toBe('stagger');
    expect(types(f)).toContain('parried');
    expect(f.heroHp).toBe(f.heroMaxHp);
  });

  it('takes a blow struck during his wind-up', () => {
    const rng = new Rng(3);
    const f = startFight(3, 1, [2]);
    run(f, rng, 5000, (x) => x.guard.phase === 'windup');
    strike(f);
    run(f, rng, SWING_MS + STEP);
    expect(f.guard.hp).toBe(1);
    expect(f.heroHp).toBe(f.heroMaxHp);
  });

  it('wins the exchange when the hero swings too late', () => {
    const rng = new Rng(3);
    const f = startFight(3, 5, [2]);
    run(f, rng, 5000, (x) => x.guard.phase === 'windup' && x.guard.timer < SWING_MS / 2);
    strike(f);
    run(f, rng, SWING_MS + STEP);
    expect(f.guard.hp).toBe(2);
    expect(f.heroHp).toBe(f.heroMaxHp - 1);
  });

  it('sometimes blocks blows struck while he stands ready', () => {
    let blocked = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const rng = new Rng(seed);
      const f = startFight(3, 3, [2]);
      run(f, rng, ENTER_MS + STEP);
      strike(f);
      run(f, rng, SWING_MS + STEP);
      if (types(f).includes('blocked')) blocked++;
    }
    expect(blocked / 200).toBeGreaterThan(blockChance(3) - 0.1);
    expect(blocked / 200).toBeLessThan(blockChance(3) + 0.1);
  });
});

/** Parries every blow and strikes back while the guard staggers. */
function perfectHero(f: Fight, rng: Rng): void {
  for (let t = 0; t < 120_000 && !f.over; t += STEP) {
    if (f.guard.phase === 'windup' && f.guard.timer <= f.parryMs / 2) parry(f);
    if (f.guard.phase === 'stagger') strike(f);
    tickFight(f, STEP, rng);
  }
}

describe('the corridor', () => {
  it('is won by beating every guard in turn', () => {
    const rng = new Rng(4);
    const f = startFight(3, 5, [2, 2, 3]);
    perfectHero(f, rng);
    expect(f).toMatchObject({ over: true, won: true, guardIndex: 2 });
    expect(f.heroHp).toBe(f.heroMaxHp);
    expect(types(f).filter((t) => t === 'nextGuard')).toHaveLength(2);
    expect(types(f).at(-1)).toBe('over');
  });

  it('is lost when the hero runs out of strength', () => {
    const rng = new Rng(5);
    const f = startFight(1, 3, [2]);
    run(f, rng, 60_000, (x) => x.over);
    expect(f).toMatchObject({ over: true, won: false, heroHp: 0 });
    expect(strike(f)).toBe(false);
    tickFight(f, 1000, rng);
    expect(f.events.filter((e) => e.type === 'over')).toHaveLength(1);
  });
});

describe('rescue stages', () => {
  it('fights outside the gate, then in the court, then in the castle', async () => {
    const { rescueStage, RESCUE_GUARDS, RESCUE_STAGES } = await import('../src/model/sword');
    expect(RESCUE_STAGES).toHaveLength(RESCUE_GUARDS.length);
    expect(RESCUE_GUARDS.map((_, i) => rescueStage(i))).toEqual(['gate', 'court', 'castle', 'castle']);
  });
});
