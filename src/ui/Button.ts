import Phaser from 'phaser';
import { addParchment } from './assets';
import { textStyle } from './theme';
import { sfx } from './audio';

export interface ButtonOptions {
  width?: number;
  height?: number;
  fontSize?: number;
  /** Fire on press instead of release, for timing-critical controls. */
  onPress?: boolean;
}

/** Warm highlight multiplied over the parchment while hovered. */
const HOVER = 0xfff0c0;

/** Parchment box with a label; brightens under the pointer. */
export class Button extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.TileSprite;
  private readonly label: Phaser.GameObjects.Text;
  private enabled = true;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    label: string,
    onClick: () => void,
    { width = 180, height = 28, fontSize = 15, onPress = false }: ButtonOptions = {},
  ) {
    super(scene, x, y);
    const { fill, frame } = addParchment(scene, 0, 0, width, height);
    this.bg = fill;
    this.label = scene.add.text(0, 0, label, textStyle(fontSize)).setOrigin(0.5);
    this.add([fill, frame, this.label]);
    this.setSize(width, height);
    this.setInteractive({ useHandCursor: true })
      .on('pointerover', () => this.bg.setTint(HOVER))
      .on('pointerout', () => this.bg.clearTint())
      .on(onPress ? 'pointerdown' : 'pointerup', () => {
        if (!onPress) sfx(scene, 'click', { volume: 0.4 });
        onClick();
      });
    scene.add.existing(this);
  }

  setLabel(label: string): this {
    this.label.setText(label);
    return this;
  }

  setEnabled(enabled: boolean): this {
    if (enabled === this.enabled) return this;
    this.enabled = enabled;
    this.setAlpha(enabled ? 1 : 0.4);
    this.bg.clearTint();
    if (enabled) this.setInteractive();
    else this.disableInteractive();
    return this;
  }
}

export function addButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
  options?: ButtonOptions,
): Button {
  return new Button(scene, x, y, label, onClick, options);
}
