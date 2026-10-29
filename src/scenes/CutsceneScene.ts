import Phaser from 'phaser';
import { HEIGHT, SceneKeys, WIDTH, type SceneKey } from '../config';

interface CutsceneData {
  text: string;
  next: SceneKey;
  nextData?: object;
}

/** Full-screen painting + caption; click to continue. */
export class CutsceneScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Cutscene);
  }

  create(data: CutsceneData): void {
    this.add.rectangle(0, 0, WIDTH, HEIGHT, 0x101010).setOrigin(0);
    this.add.rectangle(WIDTH / 2, 160, 520, 260, 0x3a2a1a).setStrokeStyle(2, 0x8a6a3a);
    this.add
      .text(WIDTH / 2, 160, '[ painting ]', { fontFamily: 'Georgia, serif', color: '#8a6a3a' })
      .setOrigin(0.5);
    this.add
      .text(WIDTH / 2, 330, data.text, {
        fontFamily: 'Georgia, serif',
        fontSize: '16px',
        color: '#f4e4bc',
        wordWrap: { width: 560 },
        align: 'center',
      })
      .setOrigin(0.5);
    this.add
      .text(WIDTH / 2, 380, 'click to continue', { fontSize: '11px', color: '#888' })
      .setOrigin(0.5);

    this.input.once('pointerup', () => this.scene.start(data.next, data.nextData));
  }
}
