import { deserialize, SAVE_KEY, serialize } from '../model/save';
import type { GameState } from '../model/types';

/** The campaign in progress, shared by all scenes, autosaved to localStorage. */
let current: GameState | null = null;

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readSave(): GameState | null {
  try {
    const json = storage()?.getItem(SAVE_KEY);
    if (!json) return null;
    const state = deserialize(json);
    return state.status === 'playing' ? state : null;
  } catch {
    return null;
  }
}

export const session = {
  get state(): GameState | null {
    return current;
  },

  start(state: GameState): void {
    current = state;
    this.save();
  },

  save(): void {
    if (!current) return;
    try {
      storage()?.setItem(SAVE_KEY, serialize(current));
    } catch {
      // Storage full or blocked: the game still works, it just won't resume.
    }
  },

  hasSave(): boolean {
    return readSave() !== null;
  },

  /** Loads the saved campaign; returns false when there is none. */
  resume(): boolean {
    current = readSave();
    return current !== null;
  },

  clear(): void {
    current = null;
    try {
      storage()?.removeItem(SAVE_KEY);
    } catch {
      // Nothing to clear.
    }
  },
};
