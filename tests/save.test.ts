import { describe, expect, it } from 'vitest';
import { DEFAULT_TEMPERAMENT, playAiTurn } from '../src/model/ai';
import { deserialize, loadGame, SAVE_KEY, SaveError, saveGame, serialize } from '../src/model/save';
import { game, memoryStorage } from './helpers';

/** A fresh game as a pre-v4 save comes back: every lord with the default temperament. */
function oldGame(): ReturnType<typeof game> {
  const s = game();
  for (const lord of Object.values(s.lords)) lord.temperament = { ...DEFAULT_TEMPERAMENT };
  return s;
}

/** A fresh game saved before temperaments existed (version 3 and earlier). */
function withoutTemperaments(version: number): Record<string, any> {
  const old = JSON.parse(JSON.stringify({ ...game(), version }));
  for (const lord of Object.values<Record<string, unknown>>(old.lords)) delete lord.temperament;
  return old;
}

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

  it('upgrades version 1 saves', () => {
    const old = withoutTemperaments(1);
    delete old.kidnap;
    delete old.ladiesTaken;
    delete old.wife;
    expect(deserialize(JSON.stringify(old))).toEqual(oldGame());
  });

  it('upgrades version 2 saves with an empty home garrison', () => {
    const old = withoutTemperaments(2);
    for (const lord of Object.values<Record<string, unknown>>(old.lords)) delete lord.reserve;
    expect(deserialize(JSON.stringify(old))).toEqual(oldGame());
  });

  it('upgrades version 3 saves with the default temperament', () => {
    expect(deserialize(JSON.stringify(withoutTemperaments(3)))).toEqual(oldGame());
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
