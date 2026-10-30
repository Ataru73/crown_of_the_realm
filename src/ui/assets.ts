import Phaser from 'phaser';
import { HEIGHT, WIDTH } from '../config';
import manifest from '../data/assets.json';
import { COLORS, textStyle } from './theme';

/** One processed image in public/assets, as listed by tools/assets/process.py. */
interface AssetEntry {
  id: string;
  size: number[];
  /** Has an `<id>_tint` layer: the areas painted in the lord's colour. */
  tint?: boolean;
  /** Named points in the image's pixels, for frames rendered in Blender (e.g. `feet`). */
  points?: Record<string, number[]>;
}

const ASSETS: AssetEntry[] = manifest;
const BY_ID = new Map(ASSETS.map((a) => [a.id, a]));

/** A named point of a rendered frame, in its own pixels, as an origin for `addTinted`. */
export function assetPoint(id: string, name: string): { x: number; y: number } {
  const p = BY_ID.get(id)?.points?.[name];
  if (!p) throw new Error(`no point ${name} in asset ${id}`);
  return { x: p[0], y: p[1] };
}

/** Queues every image in the manifest on the scene's loader. */
export function loadAssets(scene: Phaser.Scene): void {
  for (const a of ASSETS) {
    scene.load.image(a.id, `assets/${a.id}.png`);
    if (a.tint) scene.load.image(`${a.id}_tint`, `assets/${a.id}_tint.png`);
  }
}

/**
 * A sprite whose `_tint` layer is drawn on top in `color`, e.g. a tabard or a
 * caparison in the lord's colours. `origin` is in the image's own pixels.
 */
export function addTinted(
  scene: Phaser.Scene,
  x: number,
  y: number,
  key: string,
  color: number,
  origin?: { x: number; y: number },
): Phaser.GameObjects.Container {
  const base = scene.add.image(0, 0, key);
  const tint = scene.add.image(0, 0, `${key}_tint`).setTint(color);
  if (origin) {
    base.setOrigin(origin.x / base.width, origin.y / base.height);
    tint.setOrigin(origin.x / base.width, origin.y / base.height);
  }
  return scene.add.container(x, y, [base, tint]);
}

/** Recolours a container made by `addTinted`. */
export function setTintColor(sprite: Phaser.GameObjects.Container, color: number): void {
  (sprite.list[1] as Phaser.GameObjects.Image).setTint(color);
}

/** Shows another frame (`key` and its `_tint` layer) in a container made by `addTinted`. */
export function setTintedFrame(
  sprite: Phaser.GameObjects.Container,
  key: string,
  origin?: { x: number; y: number },
): void {
  const [base, tint] = sprite.list as Phaser.GameObjects.Image[];
  base.setTexture(key);
  tint.setTexture(`${key}_tint`);
  if (origin) {
    base.setOrigin(origin.x / base.width, origin.y / base.height);
    tint.setOrigin(origin.x / base.width, origin.y / base.height);
  }
}

/** A full-screen painting with its top-left at the origin. */
export function addBackdrop(scene: Phaser.Scene, key: string): Phaser.GameObjects.Image {
  return scene.add.image(0, 0, key).setOrigin(0);
}

/** A painting, darkened by `dim`, with a title (and subtitle) across the top. */
export function drawPainting(scene: Phaser.Scene, key: string, title: string, subtitle?: string, dim = 0): void {
  addBackdrop(scene, key);
  if (dim > 0) scene.add.rectangle(0, 0, WIDTH, HEIGHT, 0x000000, dim).setOrigin(0);
  scene.add
    .text(WIDTH / 2, 40, title, textStyle(30, '#f4e4bc', { stroke: '#000', strokeThickness: 5 }))
    .setOrigin(0.5);
  if (subtitle) {
    scene.add
      .text(WIDTH / 2, 76, subtitle, textStyle(14, '#f4e4bc', { stroke: '#000', strokeThickness: 3 }))
      .setOrigin(0.5);
  }
}

/** A parchment-textured box centred on (x, y) with an ink border. */
export function addParchment(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  border = 2,
): { fill: Phaser.GameObjects.TileSprite; frame: Phaser.GameObjects.Rectangle } {
  const fill = scene.add.tileSprite(x, y, width, height, 'parchment');
  const frame = scene.add.rectangle(x, y, width, height).setStrokeStyle(border, COLORS.border);
  return { fill, frame };
}
