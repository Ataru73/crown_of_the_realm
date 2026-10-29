import Phaser from 'phaser';
import { HEIGHT, SceneKeys, WIDTH } from '../config';
import type { MinigameKind, MinigameResult } from '../model/types';
import { addButton } from '../ui/Button';
import { drawPlaceholder } from '../ui/placeholder';

/**
 * Shared base for the four minigames. Until each one is implemented
 * (M3-M6) it shows a placeholder with Win / Lose buttons.
 */
export abstract class MinigameScene extends Phaser.Scene {
  protected abstract readonly kind: MinigameKind;
  protected abstract readonly title: string;
  protected abstract readonly color: number;

  create(): void {
    drawPlaceholder(this, this.color, this.title, 'Placeholder - minigame not built yet');
    const win = () => this.finish({ kind: this.kind, outcome: 'win', gold: 100, fame: 10 });
    const lose = () => this.finish({ kind: this.kind, outcome: 'lose', gold: 0, fame: -5 });
    addButton(this, WIDTH / 2 - 100, HEIGHT / 2, 'Win', win, 160);
    addButton(this, WIDTH / 2 + 100, HEIGHT / 2, 'Lose', lose, 160);
  }

  protected finish(result: MinigameResult): void {
    this.scene.start(SceneKeys.Map, { lastResult: result });
  }
}
