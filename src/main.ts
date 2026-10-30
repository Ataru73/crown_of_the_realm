import Phaser from 'phaser';
import { HEIGHT, WIDTH } from './config';
import { BattleScene } from './scenes/BattleScene';
import { BootScene } from './scenes/BootScene';
import { CutsceneScene } from './scenes/CutsceneScene';
import { GameOverScene } from './scenes/GameOverScene';
import { HeroSelectScene } from './scenes/HeroSelectScene';
import { JoustScene } from './scenes/JoustScene';
import { MapScene } from './scenes/MapScene';
import { SettingsScene, toggleSettings } from './scenes/SettingsScene';
import { SiegeScene } from './scenes/SiegeScene';
import { SwordScene } from './scenes/SwordScene';
import { TitleScene } from './scenes/TitleScene';
import { setupAudio } from './ui/audio';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: WIDTH,
  height: HEIGHT,
  backgroundColor: '#000000',
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [
    BootScene,
    TitleScene,
    HeroSelectScene,
    CutsceneScene,
    MapScene,
    JoustScene,
    SwordScene,
    SiegeScene,
    BattleScene,
    GameOverScene,
    SettingsScene,
  ],
});

setupAudio(game, document.getElementById('mute'));

const settingsButton = document.getElementById('settings');
settingsButton?.addEventListener('click', () => {
  toggleSettings(game);
  settingsButton.blur();
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !e.repeat) toggleSettings(game);
});

// Phones play in landscape: ask for it when going full screen (not every browser allows it).
game.scale.on(Phaser.Scale.Events.ENTER_FULLSCREEN, () => {
  const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
  orientation.lock?.('landscape').catch(() => {});
});

// Handy for poking at scenes from the browser console during development.
if (import.meta.env.DEV) Object.assign(window, { game });
