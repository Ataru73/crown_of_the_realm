/** Player preferences, remembered in localStorage apart from the campaign save. */
export interface Settings {
  /** 0 to 1, of the game's full music volume. */
  musicVolume: number;
  /** 0 to 1, of the game's full effects volume. */
  sfxVolume: number;
  mute: boolean;
}

export const SETTINGS_KEY = 'crown-of-the-realm.settings';
/** Where the mute toggle was remembered before the settings existed. */
const OLD_MUTE_KEY = 'crown-of-the-realm.mute';

export const DEFAULT_SETTINGS: Readonly<Settings> = { musicVolume: 1, sfxVolume: 1, mute: false };

/** Volumes move in tenths. */
export const VOLUME_STEP = 0.1;

export function clampVolume(v: number): number {
  return Number.isFinite(v) ? Math.round(Math.min(1, Math.max(0, v)) * 10) / 10 : 0;
}

/** Reads the settings, falling back to the defaults for anything missing or garbled. */
export function loadSettings(storage: Pick<Storage, 'getItem'> | null): Settings {
  const settings = { ...DEFAULT_SETTINGS };
  if (!storage) return settings;
  try {
    const json = storage.getItem(SETTINGS_KEY);
    if (json) {
      const raw = JSON.parse(json) as Partial<Record<keyof Settings, unknown>>;
      if (typeof raw.musicVolume === 'number') settings.musicVolume = clampVolume(raw.musicVolume);
      if (typeof raw.sfxVolume === 'number') settings.sfxVolume = clampVolume(raw.sfxVolume);
      if (typeof raw.mute === 'boolean') settings.mute = raw.mute;
    } else {
      settings.mute = storage.getItem(OLD_MUTE_KEY) === '1';
    }
  } catch {
    // Unreadable: keep the defaults.
  }
  return settings;
}

export function saveSettings(settings: Settings, storage: Pick<Storage, 'setItem'> | null): void {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Not remembered, but still applied.
  }
}
