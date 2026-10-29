import Phaser from 'phaser';
import { HEIGHT, WIDTH } from '../config';
import { Button } from './Button';
import { COLORS, textStyle } from './theme';

export interface DialogButton {
  label: string;
  onClick?: () => void;
}

const DEPTH = 100;

/**
 * Modal parchment panel. Returns the container so callers can add content;
 * `body` is placed under the title. Clicks outside the panel are swallowed.
 */
export function showDialog(
  scene: Phaser.Scene,
  title: string,
  body: string,
  buttons: DialogButton[],
  width = 420,
): Phaser.GameObjects.Container {
  const blocker = scene.add
    .rectangle(0, 0, WIDTH, HEIGHT, 0x000000, 0.55)
    .setOrigin(0)
    .setInteractive()
    .setDepth(DEPTH);

  const bodyText = scene.add
    .text(0, 0, body, textStyle(14, '#3a2210', { wordWrap: { width: width - 40 }, align: 'center' }))
    .setOrigin(0.5, 0);
  const height = Math.max(140, bodyText.height + 110);
  const top = -height / 2;

  const panel = scene.add.rectangle(0, 0, width, height, COLORS.parchment).setStrokeStyle(3, COLORS.border);
  const titleText = scene.add.text(0, top + 22, title, textStyle(20)).setOrigin(0.5);
  bodyText.setY(top + 48);

  const container = scene.add.container(WIDTH / 2, HEIGHT / 2, [panel, titleText, bodyText]).setDepth(DEPTH + 1);
  const close = () => {
    container.destroy();
    blocker.destroy();
  };

  const spacing = 150;
  buttons.forEach((b, i) => {
    const x = (i - (buttons.length - 1) / 2) * spacing;
    const button = new Button(scene, x, height / 2 - 26, b.label, () => {
      close();
      b.onClick?.();
    }, { width: 130, fontSize: 14 });
    container.add(button);
  });

  container.once(Phaser.GameObjects.Events.DESTROY, () => blocker.destroy());
  return container;
}
