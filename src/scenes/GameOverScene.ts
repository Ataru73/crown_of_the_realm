import Phaser from 'phaser';
import { HEIGHT, SceneKeys, WIDTH } from '../config';
import { addButton } from '../ui/Button';
import { drawPainting } from '../ui/assets';

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.GameOver);
  }

  create(data: { won: boolean }): void {
    if (data.won) {
      drawPainting(this, 'victory', 'Long Live the King!', 'England is united under your crown.');
    } else {
      drawPainting(this, 'defeat', 'Your Castle Has Fallen', 'The Normans rule England.');
    }
    addButton(this, WIDTH / 2, HEIGHT - 40, 'Back to Title', () =>
      this.scene.start(SceneKeys.Title),
    );
  }
}
