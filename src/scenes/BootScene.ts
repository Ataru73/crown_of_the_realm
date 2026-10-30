import Phaser from 'phaser';
import { HEIGHT, SceneKeys, WIDTH } from '../config';
import { loadAssets } from '../ui/assets';

export class BootScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Boot);
  }

  preload(): void {
    const bar = this.add.rectangle(WIDTH / 2 - 150, HEIGHT / 2, 0, 8, 0xd8c08a).setOrigin(0, 0.5);
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, 304, 12).setStrokeStyle(1, 0x8a6a3a);
    this.load.on('progress', (p: number) => bar.setSize(300 * p, 8));
    loadAssets(this);
  }

  create(): void {
    this.scene.start(SceneKeys.Title);
  }
}
