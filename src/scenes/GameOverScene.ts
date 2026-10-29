import Phaser from 'phaser';
import { HEIGHT, SceneKeys, WIDTH } from '../config';
import { addButton } from '../ui/Button';
import { drawPlaceholder } from '../ui/placeholder';

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.GameOver);
  }

  create(data: { won: boolean }): void {
    if (data.won) {
      drawPlaceholder(this, 0x6a5a1a, 'Long Live the King!', 'England is united under your crown.');
    } else {
      drawPlaceholder(this, 0x3a0a0a, 'Your Castle Has Fallen', 'The Normans rule England.');
    }
    addButton(this, WIDTH / 2, HEIGHT / 2 + 40, 'Back to Title', () =>
      this.scene.start(SceneKeys.Title),
    );
  }
}
