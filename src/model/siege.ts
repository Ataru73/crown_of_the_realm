import type { BattleInput } from './combat';
import type { Rng } from './rng';

/**
 * The siege: before storming a castle the attacker's catapults lob shots at
 * it, in real time. The player sets the arm's angle, holds to wind up the
 * power (it swings up and back down) and releases to throw. Stones knock
 * courses out of the wall; when a course breaks, everything above it falls.
 * Fire pots thrown over the wall burn the defenders in the bailey.
 * World units are metres: the catapult stands at x = 0, the wall's face at
 * `distance`. The scene calls `tickSiege` every frame and drains `siege.events`.
 */

export type Ammo = 'stone' | 'fire';
export type SiegePhase = 'aim' | 'charge' | 'flight' | 'impact' | 'over';

export type SiegeEvent =
  | { type: 'launch'; ammo: Ammo }
  /** A shot struck the wall at `row`; `collapsed` when that course gave way. */
  | { type: 'wall'; ammo: Ammo; row: number; damage: number; collapsed: boolean }
  /** Fell short of the wall. */
  | { type: 'short'; ammo: Ammo }
  /** Cleared the wall and landed in the bailey; fire pots burn defenders there. */
  | { type: 'yard'; ammo: Ammo }
  /** Sailed over the whole castle. */
  | { type: 'long'; ammo: Ammo }
  | { type: 'over' };

export interface Shot {
  ammo: Ammo;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Simulated seconds not yet stepped through. */
  pending: number;
}

export interface Siege {
  distance: number;
  /** Hit points left in each course of the wall, bottom first. */
  rows: number[];
  stones: number;
  fire: number;
  ammo: Ammo;
  /** Arm angle in degrees above the horizon. */
  angle: number;
  /** 0 to 1; set while charging. */
  power: number;
  /** Horizontal acceleration in m/s² for the current shot; positive blows toward the castle. */
  wind: number;
  phase: SiegePhase;
  /** Milliseconds left in the impact pause, or the time spent charging. */
  timer: number;
  shot: Shot | null;
  /** Fire pots that landed in the bailey. */
  fireHits: number;
  events: SiegeEvent[];
}

export interface SiegeResult {
  wallDamage: number;
  fireHits: number;
}

export const GRAVITY = 9.8;
export const LAUNCH_HEIGHT = 4;
export const WALL_THICKNESS = 5;
export const ROW_HEIGHT = 5;
/** Course strength from the footing up: the base is thickest. */
export const ROW_HP = [4, 3, 3, 2];
export const WALL_HEIGHT = ROW_HEIGHT * ROW_HP.length;
/** Depth of the bailey behind the wall, keep included; beyond it a shot is wasted. */
export const YARD_DEPTH = 32;
/** The keep stands at the back of the bailey; a shot striking it lands in the bailey. */
export const KEEP_OFFSET = 14;
export const KEEP_HEIGHT = 34;
export const MIN_ANGLE = 15;
export const MAX_ANGLE = 75;
export const MIN_SPEED = 14;
export const MAX_SPEED = 40;
export const MIN_DISTANCE = 80;
export const MAX_DISTANCE = 110;
export const WIND_MAX = 1.5;
/** One full swing of the power meter, up and back down. */
export const CHARGE_CYCLE_MS = 2400;
export const IMPACT_MS = 900;
/** Flight runs faster than real time so shots don't drag. */
export const FLIGHT_SPEED = 1.8;
/** Share of the defending soldiers each fire pot in the bailey kills. */
export const FIRE_KILL = 0.15;
const STEP_S = 0.01;

const TOTAL_HP = ROW_HP.reduce((a, b) => a + b, 0);

export function stonesFor(catapults: number): number {
  return Math.min(9, 3 + 2 * catapults);
}

export function firePotsFor(catapults: number): number {
  return Math.min(3, catapults);
}

export function launchSpeed(power: number): number {
  return MIN_SPEED + (MAX_SPEED - MIN_SPEED) * Math.min(1, Math.max(0, power));
}

/** The power meter's level after `ms` of charging: up to 1, then back down to 0, repeating. */
export function chargePower(ms: number): number {
  const t = (ms % CHARGE_CYCLE_MS) / (CHARGE_CYCLE_MS / 2);
  return t <= 1 ? t : 2 - t;
}

function rollWind(rng: Rng): number {
  return Math.round((rng.next() * 2 - 1) * WIND_MAX * 10) / 10;
}

export function startSiege(catapults: number, rng: Rng): Siege {
  if (catapults <= 0) throw new Error('A siege needs at least one catapult');
  return {
    distance: Math.round(MIN_DISTANCE + rng.next() * (MAX_DISTANCE - MIN_DISTANCE)),
    rows: [...ROW_HP],
    stones: stonesFor(catapults),
    fire: firePotsFor(catapults),
    ammo: 'stone',
    angle: 45,
    power: 0,
    wind: rollWind(rng),
    phase: 'aim',
    timer: 0,
    shot: null,
    fireHits: 0,
    events: [],
  };
}

/** Courses still standing: the wall's height in rows. */
export function standingRows(s: Siege): number {
  const broken = s.rows.findIndex((hp) => hp <= 0);
  return broken === -1 ? s.rows.length : broken;
}

export function wallDamage(s: Siege): number {
  const left = s.rows.slice(0, standingRows(s)).reduce((a, b) => a + b, 0);
  return 1 - left / TOTAL_HP;
}

export function ammoLeft(s: Siege, ammo: Ammo = s.ammo): number {
  return ammo === 'stone' ? s.stones : s.fire;
}

export function siegeResult(s: Siege): SiegeResult {
  return { wallDamage: wallDamage(s), fireHits: s.fireHits };
}

export function setAngle(s: Siege, angle: number): void {
  if (s.phase !== 'aim') return;
  s.angle = Math.min(MAX_ANGLE, Math.max(MIN_ANGLE, angle));
}

export function selectAmmo(s: Siege, ammo: Ammo): boolean {
  if (s.phase !== 'aim' || ammoLeft(s, ammo) <= 0) return false;
  s.ammo = ammo;
  return true;
}

/** Starts winding the arm; the power meter swings until `release`. */
export function startCharge(s: Siege): boolean {
  if (s.phase !== 'aim' || ammoLeft(s) <= 0) return false;
  s.phase = 'charge';
  s.timer = 0;
  s.power = 0;
  return true;
}

/** Throws a shot at the current angle with the given power (0 to 1). */
export function fire(s: Siege, power: number): boolean {
  if ((s.phase !== 'aim' && s.phase !== 'charge') || ammoLeft(s) <= 0) return false;
  s.power = Math.min(1, Math.max(0, power));
  if (s.ammo === 'stone') s.stones -= 1;
  else s.fire -= 1;
  const v = launchSpeed(s.power);
  const a = (s.angle * Math.PI) / 180;
  s.shot = { ammo: s.ammo, x: 0, y: LAUNCH_HEIGHT, vx: v * Math.cos(a), vy: v * Math.sin(a), pending: 0 };
  s.phase = 'flight';
  s.events.push({ type: 'launch', ammo: s.ammo });
  return true;
}

/** Lets go of the arm at the power the meter has reached. */
export function release(s: Siege): boolean {
  if (s.phase !== 'charge') return false;
  return fire(s, s.power);
}

/** The attacker stops the bombardment and storms the walls. */
export function endSiege(s: Siege): void {
  if (s.phase === 'over') return;
  s.phase = 'over';
  s.shot = null;
  s.events.push({ type: 'over' });
}

function strikeWall(s: Siege, ammo: Ammo, y: number): void {
  const row = Math.min(standingRows(s) - 1, Math.max(0, Math.floor(y / ROW_HEIGHT)));
  if (ammo === 'fire') {
    s.events.push({ type: 'wall', ammo, row, damage: 0, collapsed: false });
    return;
  }
  s.rows[row] -= 1;
  const collapsed = s.rows[row] <= 0;
  // The courses above a broken one come down with it.
  if (collapsed) for (let r = row; r < s.rows.length; r++) s.rows[r] = 0;
  s.events.push({ type: 'wall', ammo, row, damage: 1, collapsed });
}

/** Moves the shot one step; returns true when it has landed. */
function stepShot(s: Siege, shot: Shot): boolean {
  const front = s.distance;
  const back = front + WALL_THICKNESS;
  const height = standingRows(s) * ROW_HEIGHT;
  const x0 = shot.x;
  const y0 = shot.y;
  shot.vx += s.wind * STEP_S;
  shot.vy -= GRAVITY * STEP_S;
  shot.x += shot.vx * STEP_S;
  shot.y += shot.vy * STEP_S;

  if (x0 < front && shot.x >= front) {
    const yAtFace = y0 + ((shot.y - y0) * (front - x0)) / (shot.x - x0);
    // It hit the ground just before the wall.
    if (yAtFace < 0) {
      shot.x = x0 + ((shot.x - x0) * y0) / (y0 - shot.y);
      shot.y = 0;
      s.events.push({ type: 'short', ammo: shot.ammo });
      return true;
    }
    // Crossing the wall's face below its top: a hit.
    if (height > 0 && yAtFace <= height) {
      shot.x = front;
      shot.y = yAtFace;
      strikeWall(s, shot.ammo, yAtFace);
      return true;
    }
  }
  // Coming down on top of the wall.
  if (height > 0 && y0 > height && shot.x >= front && shot.x <= back && shot.y <= height) {
    shot.y = height;
    strikeWall(s, shot.ammo, height - 0.01);
    return true;
  }
  // Striking the side of the keep drops the shot into the bailey.
  const keep = back + KEEP_OFFSET;
  if (x0 < keep && shot.x >= keep && shot.y <= KEEP_HEIGHT) {
    shot.x = keep;
    shot.y = 0;
  }
  if (shot.y > 0) return false;

  shot.y = 0;
  if (shot.x < front) s.events.push({ type: 'short', ammo: shot.ammo });
  else if (shot.x <= back + YARD_DEPTH) {
    if (shot.ammo === 'fire') s.fireHits += 1;
    s.events.push({ type: 'yard', ammo: shot.ammo });
  } else s.events.push({ type: 'long', ammo: shot.ammo });
  return true;
}

function nextShot(s: Siege, rng: Rng): void {
  if (s.stones + s.fire === 0) {
    endSiege(s);
    return;
  }
  if (ammoLeft(s) === 0) s.ammo = s.ammo === 'stone' ? 'fire' : 'stone';
  s.phase = 'aim';
  s.power = 0;
  s.wind = rollWind(rng);
}

/** Advances the siege by `dt` milliseconds. */
export function tickSiege(s: Siege, dt: number, rng: Rng): void {
  switch (s.phase) {
    case 'charge':
      s.timer += dt;
      s.power = chargePower(s.timer);
      break;
    case 'flight': {
      const shot = s.shot!;
      shot.pending += (dt / 1000) * FLIGHT_SPEED;
      for (; shot.pending >= STEP_S; shot.pending -= STEP_S) {
        if (stepShot(s, shot)) {
          s.phase = 'impact';
          s.timer = IMPACT_MS;
          break;
        }
      }
      break;
    }
    case 'impact':
      s.timer -= dt;
      if (s.timer <= 0) {
        s.shot = null;
        nextShot(s, rng);
      }
      break;
  }
}

/** The assault after the siege: the wall as the siege left it, and the soldiers the fire burned. */
export function applySiege(input: BattleInput, result: SiegeResult): BattleInput {
  const survive = (1 - FIRE_KILL) ** result.fireHits;
  return {
    ...input,
    wallDamage: result.wallDamage,
    defender: { ...input.defender, soldiers: Math.floor(input.defender.soldiers * survive) },
  };
}
