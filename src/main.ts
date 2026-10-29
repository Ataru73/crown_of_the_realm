import Phaser from 'phaser';
import { HEIGHT, WIDTH } from './config';
import { BattleScene } from './scenes/BattleScene';
import { BootScene } from './scenes/BootScene';
import { CutsceneScene } from './scenes/CutsceneScene';
import { GameOverScene } from './scenes/GameOverScene';
import { JoustScene } from './scenes/JoustScene';
import { MapScene } from './scenes/MapScene';
import { SiegeScene } from './scenes/SiegeScene';
import { SwordScene } from './scenes/SwordScene';
import { TitleScene } from './scenes/TitleScene';

new Phaser.Game({
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
    CutsceneScene,
    MapScene,
    JoustScene,
    SwordScene,
    SiegeScene,
    BattleScene,
    GameOverScene,
  ],
});
