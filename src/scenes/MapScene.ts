import Phaser from 'phaser';
import { HEIGHT, SceneKeys, WIDTH } from '../config';
import type { MinigameResult } from '../model/types';
import { addButton } from '../ui/Button';
import { drawPlaceholder } from '../ui/placeholder';

interface MapData {
  lastResult?: MinigameResult;
}

/** Campaign map. For M0 it is only a hub that launches every other scene. */
export class MapScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Map);
  }

  create(data: MapData): void {
    drawPlaceholder(this, 0x2f4a2a, 'Map of England', 'Choose your action for this month');

    const x = WIDTH / 2;
    addButton(this, x, 130, 'Hold a Tournament', () => this.scene.start(SceneKeys.Joust));
    addButton(this, x, 165, 'Go Raiding', () => this.scene.start(SceneKeys.Sword));
    addButton(this, x, 200, 'Lay Siege', () => this.scene.start(SceneKeys.Siege));
    addButton(this, x, 235, 'Go Conquering', () => this.scene.start(SceneKeys.Battle));
    addButton(this, x, 290, 'Surrender', () =>
      this.scene.start(SceneKeys.GameOver, { won: false }),
    );
    addButton(this, x, 325, 'Claim the Crown', () =>
      this.scene.start(SceneKeys.GameOver, { won: true }),
    );

    if (data.lastResult) {
      const r = data.lastResult;
      this.add
        .text(
          WIDTH / 2,
          HEIGHT - 20,
          `Last ${r.kind}: ${r.outcome.toUpperCase()}  (gold ${r.gold >= 0 ? '+' : ''}${r.gold}, fame ${r.fame >= 0 ? '+' : ''}${r.fame})`,
          { fontFamily: 'Georgia, serif', fontSize: '14px', color: '#f4e4bc' },
        )
        .setOrigin(0.5);
    }
  }
}
