import Phaser from 'phaser';

/** Placeholder button: parchment-colored box with a label. */
export function addButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
  width = 180,
): Phaser.GameObjects.Container {
  const height = 28;
  const bg = scene.add
    .rectangle(0, 0, width, height, 0xd8c08a)
    .setStrokeStyle(2, 0x5a3a1a);
  const text = scene.add
    .text(0, 0, label, { fontFamily: 'Georgia, serif', fontSize: '15px', color: '#3a2210' })
    .setOrigin(0.5);

  const button = scene.add.container(x, y, [bg, text]).setSize(width, height);
  button
    .setInteractive({ useHandCursor: true })
    .on('pointerover', () => bg.setFillStyle(0xf0dca8))
    .on('pointerout', () => bg.setFillStyle(0xd8c08a))
    .on('pointerup', onClick);
  return button;
}
