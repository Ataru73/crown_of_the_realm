import Phaser from 'phaser';
import { HEIGHT, SceneKeys, WIDTH, type SceneKey } from '../config';
import { addBackdrop } from '../ui/assets';
import { onKeys } from '../ui/modal';
import { playMusic, type Track } from '../ui/audio';
import { textStyle } from '../ui/theme';

export interface CutsceneData {
  text: string;
  next: SceneKey;
  nextData?: object;
  /** Texture key of the painting; the campaign intro by default. */
  image?: string;
  /** Music for the scene; the title theme by default. */
  music?: Track;
}

/** Full-screen painting + caption; click, tap, Enter or Space to continue. */
export class CutsceneScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Cutscene);
  }

  create(data: CutsceneData): void {
    playMusic(this, data.music ?? 'title', data.music !== 'victory');
    addBackdrop(this, data.image ?? 'intro');
    this.add.rectangle(0, HEIGHT - 84, WIDTH, 84, 0x000000, 0.65).setOrigin(0);
    this.add
      .text(WIDTH / 2, HEIGHT - 50, data.text, textStyle(16, '#f4e4bc', { wordWrap: { width: 580 }, align: 'center' }))
      .setOrigin(0.5);
    this.add
      .text(WIDTH / 2, HEIGHT - 12, 'click or press Enter to continue', textStyle(11, '#a89878'))
      .setOrigin(0.5);

    this.cameras.main.fadeIn(400);
    let done = false;
    const next = () => {
      if (done) return;
      done = true;
      this.scene.start(data.next, data.nextData);
    };
    this.input.once('pointerup', next);
    onKeys(this, ['ENTER', 'SPACE'], next);
  }
}
