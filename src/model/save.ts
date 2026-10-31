import { TERRITORIES } from './map';
import { STATE_VERSION } from './state';
import type { GameState } from './types';

export const SAVE_KEY = 'crown-of-the-realm.save';

export class SaveError extends Error {
  override name = 'SaveError';
}

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

export function deserialize(json: string): GameState {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new SaveError('Save data is not valid JSON');
  }
  const state = data as Partial<GameState> | null;
  if (!state || typeof state !== 'object') throw new SaveError('Save data is not an object');
  if (state.version === 1) migrateV1(state);
  if (state.version === 2) migrateV2(state);
  if (state.version !== STATE_VERSION) {
    throw new SaveError(`Unsupported save version: ${String(state.version)}`);
  }
  if (!state.lords || !state.territories || !Array.isArray(state.turnOrder)) {
    throw new SaveError('Save data is incomplete');
  }
  for (const def of TERRITORIES) {
    if (!state.territories[def.id]) throw new SaveError(`Save is missing territory ${def.id}`);
  }
  return state as GameState;
}

/** Version 2 added the kidnap event. */
function migrateV1(state: Partial<GameState>): void {
  state.kidnap = null;
  state.ladiesTaken = [];
  state.wife = null;
  state.version = 2;
}

/** Version 3 added the home garrison (`reserve`). */
function migrateV2(state: Partial<GameState>): void {
  for (const lord of Object.values(state.lords ?? {})) lord.reserve = { soldiers: 0, knights: 0, catapults: 0 };
  state.version = 3;
}

export function saveGame(state: GameState, storage: Pick<Storage, 'setItem'>): void {
  storage.setItem(SAVE_KEY, serialize(state));
}

/** Returns null when there is no save; throws SaveError when it is unreadable. */
export function loadGame(storage: Pick<Storage, 'getItem'>): GameState | null {
  const json = storage.getItem(SAVE_KEY);
  return json === null ? null : deserialize(json);
}
