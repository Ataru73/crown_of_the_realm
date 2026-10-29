import Phaser from 'phaser';
import { HEIGHT, SceneKeys, WIDTH } from '../config';
import { session } from '../game/session';
import { addButton } from '../ui/Button';
import { drawPlaceholder } from '../ui/placeholder';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Title);
  }

  create(): void {
    drawPlaceholder(this, 0x2a1a3a, 'Crown of the Realm', 'England, 1149. The king is dead.');
    const hasSave = session.hasSave();
    if (hasSave) {
      addButton(this, WIDTH / 2, HEIGHT / 2 - 20, 'Continue', () => {
        if (session.resume()) this.scene.start(SceneKeys.Map);
      });
    }
    addButton(this, WIDTH / 2, HEIGHT / 2 + (hasSave ? 20 : 0), 'New Campaign', () =>
      this.scene.start(SceneKeys.HeroSelect),
    );
  }
}
