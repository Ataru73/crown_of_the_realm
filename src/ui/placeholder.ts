import Phaser from 'phaser';
import { HEIGHT, WIDTH } from '../config';

/** Full-screen colored backdrop with a title, standing in for real art. */
export function drawPlaceholder(
  scene: Phaser.Scene,
  color: number,
  title: string,
  subtitle?: string,
): void {
  scene.add.rectangle(0, 0, WIDTH, HEIGHT, color).setOrigin(0);
  scene.add
    .text(WIDTH / 2, 40, title, {
      fontFamily: 'Georgia, serif',
      fontSize: '28px',
      color: '#f4e4bc',
      stroke: '#000',
      strokeThickness: 4,
    })
    .setOrigin(0.5);
  if (subtitle) {
    scene.add
      .text(WIDTH / 2, 76, subtitle, {
        fontFamily: 'Georgia, serif',
        fontSize: '14px',
        color: '#f4e4bc',
      })
      .setOrigin(0.5);
  }
}
