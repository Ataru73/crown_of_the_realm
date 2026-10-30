import { describe, expect, it } from 'vitest';
import { clampVolume, DEFAULT_SETTINGS, loadSettings, saveSettings, SETTINGS_KEY } from '../src/game/settings';
import { memoryStorage } from './helpers';

describe('settings', () => {
  it('defaults when nothing is stored', () => {
    expect(loadSettings(memoryStorage())).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips through storage', () => {
    const storage = memoryStorage();
    saveSettings({ musicVolume: 0.3, sfxVolume: 1, mute: true }, storage);
    expect(loadSettings(storage)).toEqual({ musicVolume: 0.3, sfxVolume: 1, mute: true });
  });

  it('ignores garbled or out-of-range values', () => {
    const storage = memoryStorage();
    storage.setItem(SETTINGS_KEY, '{"musicVolume": 7, "sfxVolume": "loud", "mute": 1}');
    expect(loadSettings(storage)).toEqual({ ...DEFAULT_SETTINGS, musicVolume: 1 });
    storage.setItem(SETTINGS_KEY, '{"musicVolume": -2, "sfxVolume": 0.25}');
    expect(loadSettings(storage)).toEqual({ ...DEFAULT_SETTINGS, musicVolume: 0, sfxVolume: 0.3 });
    storage.setItem(SETTINGS_KEY, 'not json');
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps the mute toggle remembered before settings existed', () => {
    const storage = memoryStorage();
    storage.setItem('crown-of-the-realm.mute', '1');
    expect(loadSettings(storage).mute).toBe(true);
  });

  it('rounds volumes to tenths within 0..1', () => {
    expect(clampVolume(0.1 + 0.2)).toBe(0.3);
    expect(clampVolume(-0.1)).toBe(0);
    expect(clampVolume(1.04)).toBe(1);
    expect(clampVolume(NaN)).toBe(0);
  });
});
