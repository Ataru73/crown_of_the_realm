import type { Rng } from './rng';

/**
 * The sword fight: the hero fights a corridor of guards one at a time, in real
 * time. Each guard waits, winds up (the telegraph) and strikes. Striking him
 * while he is winding up or staggered lands a blow; striking while he stands
 * ready may be blocked. Parrying just before his strike lands staggers him.
 * The scene calls `tickFight` every frame and drains `fight.events`.
 */

export type GuardPhase = 'enter' | 'ready' | 'windup' | 'stagger' | 'down';
export type HeroPhase = 'ready' | 'swing' | 'parry' | 'recover' | 'hit';

export type SwordEvent =
  | { type: 'swing' }
  | { type: 'parryUp' }
  | { type: 'windup' }
  /** The hero's blow landed; `down` when the guard falls. */
  | { type: 'hit'; down: boolean }
  | { type: 'blocked' }
  | { type: 'parried' }
  | { type: 'wounded' }
  | { type: 'nextGuard' }
  | { type: 'over'; won: boolean };

export interface Guard {
  hp: number;
  maxHp: number;
  phase: GuardPhase;
  /** Milliseconds left in the current phase. */
  timer: number;
}

export interface Fight {
  /** Guard skill, 1 to 5: faster wind-ups and more blocks. */
  level: number;
  /** Hit points of each guard in the corridor, in order. */
  guardHps: number[];
  guardIndex: number;
  guard: Guard;
  heroHp: number;
  heroMaxHp: number;
  hero: { phase: HeroPhase; timer: number };
  parryMs: number;
  over: boolean;
  won: boolean;
  events: SwordEvent[];
}

export const SWING_MS = 250;
export const RECOVER_MS = 250;
export const BLOCKED_RECOVER_MS = 500;
export const HIT_STUN_MS = 450;
export const STAGGER_MS = 800;
export const ENTER_MS = 900;
/** Hit points of the guards along the corridor; the last one is their captain. */
export const RAID_GUARDS = [2, 2, 3];
/** One more guard, then the captor himself. */
export const RESCUE_GUARDS = [2, 2, 2, 3];
const READY_MIN_MS = 700;
const READY_SPREAD_MS = 900;

/** How long a guard telegraphs his strike. */
export function windupMs(level: number): number {
  return 900 - 120 * level;
}

/** How long the hero's parry stays up. */
export function parryMs(swordplay: number): number {
  return 150 + 30 * swordplay;
}

/** Chance a ready guard blocks the hero's blow. */
export function blockChance(level: number): number {
  return 0.35 + 0.08 * level;
}

export function heroHp(swordplay: number): number {
  return 2 + swordplay;
}

export function startFight(swordplay: number, level: number, guardHps: number[]): Fight {
  if (guardHps.length === 0) throw new Error('A fight needs at least one guard');
  const hp = heroHp(swordplay);
  return {
    level,
    guardHps: [...guardHps],
    guardIndex: 0,
    guard: { hp: guardHps[0], maxHp: guardHps[0], phase: 'enter', timer: ENTER_MS },
    heroHp: hp,
    heroMaxHp: hp,
    hero: { phase: 'ready', timer: 0 },
    parryMs: parryMs(swordplay),
    over: false,
    won: false,
    events: [],
  };
}

const canAct = (f: Fight) => !f.over && f.hero.phase === 'ready' && f.guard.phase !== 'enter' && f.guard.phase !== 'down';

/** The hero starts a blow; it lands (or is blocked) when the swing completes. */
export function strike(f: Fight): boolean {
  if (!canAct(f)) return false;
  f.hero = { phase: 'swing', timer: SWING_MS };
  f.events.push({ type: 'swing' });
  return true;
}

export function parry(f: Fight): boolean {
  if (!canAct(f)) return false;
  f.hero = { phase: 'parry', timer: f.parryMs };
  f.events.push({ type: 'parryUp' });
  return true;
}

function guardReady(f: Fight, rng: Rng): void {
  f.guard.phase = 'ready';
  f.guard.timer = READY_MIN_MS + rng.next() * READY_SPREAD_MS;
}

function end(f: Fight, won: boolean): void {
  f.over = true;
  f.won = won;
  f.events.push({ type: 'over', won });
}

/** The hero's swing completes. */
function landBlow(f: Fight, rng: Rng): void {
  const g = f.guard;
  if (g.phase === 'ready' && rng.next() < blockChance(f.level)) {
    f.events.push({ type: 'blocked' });
    f.hero = { phase: 'recover', timer: BLOCKED_RECOVER_MS };
    return;
  }
  g.hp -= 1;
  f.hero = { phase: 'recover', timer: RECOVER_MS };
  const down = g.hp <= 0;
  f.events.push({ type: 'hit', down });
  if (!down) {
    // A blow interrupts his wind-up; he steps back and recovers.
    guardReady(f, rng);
    return;
  }
  g.phase = 'down';
  g.timer = ENTER_MS;
  if (f.guardIndex === f.guardHps.length - 1) end(f, true);
}

/** The guard's wind-up completes and his blade comes down. */
function guardStrikes(f: Fight, rng: Rng): void {
  if (f.hero.phase === 'parry') {
    f.events.push({ type: 'parried' });
    f.guard.phase = 'stagger';
    f.guard.timer = STAGGER_MS;
    f.hero = { phase: 'ready', timer: 0 };
    return;
  }
  f.heroHp -= 1;
  f.events.push({ type: 'wounded' });
  f.hero = { phase: 'hit', timer: HIT_STUN_MS };
  guardReady(f, rng);
  if (f.heroHp <= 0) end(f, false);
}

/** Advances the fight by `dt` milliseconds. */
export function tickFight(f: Fight, dt: number, rng: Rng): void {
  if (f.over) return;

  if (f.hero.phase !== 'ready') {
    f.hero.timer -= dt;
    if (f.hero.timer <= 0) {
      if (f.hero.phase === 'swing') landBlow(f, rng);
      else f.hero = { phase: 'ready', timer: 0 };
      if (f.over) return;
    }
  }

  const g = f.guard;
  g.timer -= dt;
  if (g.timer > 0) return;
  switch (g.phase) {
    case 'enter':
    case 'stagger':
      guardReady(f, rng);
      break;
    case 'ready':
      g.phase = 'windup';
      g.timer = windupMs(f.level);
      f.events.push({ type: 'windup' });
      break;
    case 'windup':
      guardStrikes(f, rng);
      break;
    case 'down': {
      f.guardIndex += 1;
      const hp = f.guardHps[f.guardIndex];
      f.guard = { hp, maxHp: hp, phase: 'enter', timer: ENTER_MS };
      f.hero = { phase: 'ready', timer: 0 };
      f.events.push({ type: 'nextGuard' });
      break;
    }
  }
}
