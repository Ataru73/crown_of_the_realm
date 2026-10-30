import Phaser from 'phaser';
import music from '../data/music.json';
import { clampVolume, loadSettings, saveSettings, type Settings } from '../game/settings';

/** Sound effects in public/assets/sfx, made by tools/assets/sfx.py. */
export const SFX = [
  'sword_clash', 'sword_hit', 'swing', 'lance_hit', 'gallop', 'catapult', 'impact',
  'fire', 'cheer', 'groan', 'coins', 'drum', 'horn', 'click',
] as const;
export type Sfx = (typeof SFX)[number];

/** Music tracks; only those listed in music.json (made by tools/assets/music.py) exist. */
export type Track =
  | 'title' | 'campaign' | 'tournament' | 'battle' | 'siege'
  | 'swordfight' | 'romance' | 'victory' | 'defeat';

const TRACKS: string[] = music;
const FADE_MS = 800;
/** Full volume for music and effects; the settings scale these down. */
const MUSIC_VOLUME = 0.5;
const SFX_VOLUME = 0.7;

let current: { track: Track; sound: Phaser.Sound.BaseSound } | null = null;

export function loadAudio(scene: Phaser.Scene): void {
  for (const id of SFX) scene.load.audio(`sfx_${id}`, [`assets/sfx/${id}.ogg`, `assets/sfx/${id}.mp3`]);
  for (const id of TRACKS) scene.load.audio(`music_${id}`, [`assets/music/${id}.ogg`, `assets/music/${id}.mp3`]);
}

export function sfx(scene: Phaser.Scene, id: Sfx, config: Phaser.Types.Sound.SoundConfig = {}): void {
  scene.sound.play(`sfx_${id}`, { ...config, volume: (config.volume ?? SFX_VOLUME) * settings.sfxVolume });
}

/** A looping effect (hoofbeats, flames) the caller stops itself. */
export function sfxLoop(scene: Phaser.Scene, id: Sfx, volume = 0.5): Phaser.Sound.BaseSound {
  const sound = scene.sound.add(`sfx_${id}`, { loop: true, volume: volume * settings.sfxVolume });
  sound.play();
  return sound;
}

function fade(scene: Phaser.Scene, sound: Phaser.Sound.BaseSound, to: number, onComplete?: () => void): void {
  scene.tweens.add({ targets: sound, volume: to, duration: FADE_MS, onComplete });
}

/**
 * Crossfades to `track`, looping unless `loop` is false (for stings). Keeps
 * playing if it's already on, and stays silent if the track hasn't been made yet.
 */
export function playMusic(scene: Phaser.Scene, track: Track, loop = true): void {
  if (current?.track === track && current.sound.isPlaying) return;
  stopMusic(scene);
  const key = `music_${track}`;
  if (!scene.cache.audio.exists(key)) return;
  const sound = scene.sound.add(key, { loop, volume: 0 });
  sound.play();
  fade(scene, sound, MUSIC_VOLUME * settings.musicVolume);
  current = { track, sound };
}

export function stopMusic(scene: Phaser.Scene): void {
  if (!current) return;
  const { sound } = current;
  current = null;
  fade(scene, sound, 0, () => sound.destroy());
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

let settings: Settings = loadSettings(storage());
let game: Phaser.Game | null = null;
const listeners: (() => void)[] = [];

export function getSettings(): Readonly<Settings> {
  return settings;
}

/** Applies and remembers a change to the sound settings. */
export function updateSettings(change: Partial<Settings>): void {
  settings = { ...settings, ...change };
  settings.musicVolume = clampVolume(settings.musicVolume);
  settings.sfxVolume = clampVolume(settings.sfxVolume);
  saveSettings(settings, storage());
  if (game) game.sound.mute = settings.mute;
  if (current && 'volume' in current.sound) (current.sound as Phaser.Sound.WebAudioSound).volume = MUSIC_VOLUME * settings.musicVolume;
  listeners.forEach((l) => l());
}

/** Calls `listener` after every settings change until the returned function is called. */
export function onSettingsChange(listener: () => void): () => void {
  listeners.push(listener);
  return () => void listeners.splice(listeners.indexOf(listener), 1);
}

export function toggleMute(): void {
  updateSettings({ mute: !settings.mute });
}

/** Restores the remembered settings and wires up the mute button and the M key. */
export function setupAudio(phaserGame: Phaser.Game, muteButton: HTMLElement | null): void {
  game = phaserGame;
  game.sound.mute = settings.mute;
  const show = () => {
    if (muteButton) muteButton.textContent = settings.mute ? '🔇' : '🔊';
  };
  onSettingsChange(show);
  show();
  muteButton?.addEventListener('click', () => {
    toggleMute();
    muteButton.blur();
  });
  window.addEventListener('keydown', (e) => {
    if ((e.key === 'm' || e.key === 'M') && !e.repeat) toggleMute();
  });
}
