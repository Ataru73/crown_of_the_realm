import Phaser from 'phaser';
import { HEIGHT, SceneKeys, WIDTH } from '../config';
import { session } from '../game/session';
import { addButton } from '../ui/Button';
import { drawPainting } from '../ui/assets';
import { playMusic } from '../ui/audio';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Title);
  }

  create(): void {
    playMusic(this, 'title');
    drawPainting(this, 'title', 'Crown of the Realm', 'England, 1149. The king is dead.');
    const hasSave = session.hasSave();
    if (hasSave) {
      addButton(this, WIDTH / 2, HEIGHT - 76, 'Continue', () => {
        if (session.resume()) this.scene.start(SceneKeys.Map);
      }, { keys: ['ENTER', 'SPACE', 'C'] });
    }
    addButton(this, WIDTH / 2, HEIGHT - (hasSave ? 38 : 56), 'New Campaign', () =>
      this.scene.start(SceneKeys.HeroSelect),
    { keys: hasSave ? ['N'] : ['ENTER', 'SPACE', 'N'] });
  }
}
