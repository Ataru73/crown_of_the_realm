import Phaser from 'phaser';
import music from '../data/music.json';

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
const MUTE_KEY = 'crown-of-the-realm.mute';
const MUSIC_VOLUME = 0.5;
const FADE_MS = 800;

let current: { track: Track; sound: Phaser.Sound.BaseSound } | null = null;

export function loadAudio(scene: Phaser.Scene): void {
  for (const id of SFX) scene.load.audio(`sfx_${id}`, [`assets/sfx/${id}.ogg`, `assets/sfx/${id}.mp3`]);
  for (const id of TRACKS) scene.load.audio(`music_${id}`, [`assets/music/${id}.ogg`, `assets/music/${id}.mp3`]);
}

export function sfx(scene: Phaser.Scene, id: Sfx, config: Phaser.Types.Sound.SoundConfig = {}): void {
  scene.sound.play(`sfx_${id}`, { volume: 0.7, ...config });
}

/** A looping effect (hoofbeats, flames) the caller stops itself. */
export function sfxLoop(scene: Phaser.Scene, id: Sfx, volume = 0.5): Phaser.Sound.BaseSound {
  const sound = scene.sound.add(`sfx_${id}`, { loop: true, volume });
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
  fade(scene, sound, MUSIC_VOLUME);
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

/** Restores the remembered mute setting and wires up a toggle button and the M key. */
export function setupMute(game: Phaser.Game, button: HTMLElement | null): void {
  const show = () => {
    if (button) button.textContent = game.sound.mute ? '🔇' : '🔊';
  };
  const toggle = () => {
    game.sound.mute = !game.sound.mute;
    try {
      storage()?.setItem(MUTE_KEY, game.sound.mute ? '1' : '0');
    } catch {
      // Not remembered, but still toggled.
    }
    show();
  };
  game.sound.mute = storage()?.getItem(MUTE_KEY) === '1';
  show();
  button?.addEventListener('click', toggle);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'm' || e.key === 'M') toggle();
  });
}
