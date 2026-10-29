import Phaser from 'phaser';
import { HEIGHT, SceneKeys, WIDTH } from '../config';
import { addButton } from '../ui/Button';
import { drawPlaceholder } from '../ui/placeholder';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Title);
  }

  create(): void {
    drawPlaceholder(this, 0x2a1a3a, 'Crown of the Realm', 'England, 1149. The king is dead.');
    addButton(this, WIDTH / 2, HEIGHT / 2, 'New Campaign', () =>
      this.scene.start(SceneKeys.Cutscene, {
        text: 'Saxon lords rise against the Norman invaders...',
        next: SceneKeys.Map,
      }),
    );
  }
}
