import Phaser from 'phaser';
import { SceneKeys } from '../config';

export class BootScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Boot);
  }

  preload(): void {
    // Real assets get loaded here once the asset pipeline (M7) produces them.
  }

  create(): void {
    this.scene.start(SceneKeys.Title);
  }
}
