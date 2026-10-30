import Phaser from 'phaser';
import { COLORS, textStyle } from './theme';

export interface ButtonOptions {
  width?: number;
  height?: number;
  fontSize?: number;
  /** Fire on press instead of release, for timing-critical controls. */
  onPress?: boolean;
}

/** Placeholder button: parchment-colored box with a label. */
export class Button extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.Rectangle;
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
    this.bg = scene.add.rectangle(0, 0, width, height, COLORS.parchment).setStrokeStyle(2, COLORS.border);
    this.label = scene.add.text(0, 0, label, textStyle(fontSize)).setOrigin(0.5);
    this.add([this.bg, this.label]);
    this.setSize(width, height);
    this.setInteractive({ useHandCursor: true })
      .on('pointerover', () => this.bg.setFillStyle(COLORS.parchmentLight))
      .on('pointerout', () => this.bg.setFillStyle(COLORS.parchment))
      .on(onPress ? 'pointerdown' : 'pointerup', onClick);
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
    this.bg.setFillStyle(COLORS.parchment);
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
