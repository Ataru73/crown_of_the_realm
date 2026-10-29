import { describe, expect, it } from 'vitest';
import { playAiTurn } from '../src/model/ai';
import { deserialize, loadGame, SAVE_KEY, SaveError, saveGame, serialize } from '../src/model/save';
import { game, memoryStorage } from './helpers';

describe('save/load', () => {
  it('round-trips a game in progress', () => {
    const s = game(5);
    for (let i = 0; i < 30; i++) playAiTurn(s);
    expect(deserialize(serialize(s))).toEqual(s);
  });

  it('continues identically after loading', () => {
    const a = game(5);
    for (let i = 0; i < 20; i++) playAiTurn(a);
    const b = deserialize(serialize(a));
    for (let i = 0; i < 40; i++) {
      playAiTurn(a);
      playAiTurn(b);
    }
    expect(b).toEqual(a);
  });

  it('saves to and loads from storage', () => {
    const storage = memoryStorage();
    expect(loadGame(storage)).toBeNull();
    const s = game();
    saveGame(s, storage);
    expect(storage.data.has(SAVE_KEY)).toBe(true);
    expect(loadGame(storage)).toEqual(s);
  });

  it('rejects bad save data', () => {
    expect(() => deserialize('not json')).toThrow(SaveError);
    expect(() => deserialize('null')).toThrow(SaveError);
    expect(() => deserialize(JSON.stringify({ ...game(), version: 99 }))).toThrow(/version/);
    const missing = game();
    delete (missing.territories as Record<string, unknown>).kent;
    expect(() => deserialize(serialize(missing))).toThrow(/kent/);
  });
});
