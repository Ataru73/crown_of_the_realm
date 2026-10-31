import Phaser from 'phaser';
import { strength } from '../model/army';
import { BORDERS, TERRITORIES, type TerritoryDef } from '../model/map';
import type { GameState, TerritoryId } from '../model/types';
import { addTinted, setTintColor } from './assets';
import { COLORS, lordColor, textStyle } from './theme';

const RADIUS = 13;

/** Territory coordinates are pixels on the painted map. */
export function mapPosition(def: TerritoryDef): { x: number; y: number } {
  return { x: def.x, y: def.y };
}

interface Node {
  ring: Phaser.GameObjects.Arc;
  shield: Phaser.GameObjects.Container;
  castle: Phaser.GameObjects.Image;
  banner: Phaser.GameObjects.Container;
  bannerText: Phaser.GameObjects.Text;
}

/** Territories as heraldic shields in their owner's colours; click one to select it. */
export class MapView {
  private readonly nodes = new Map<TerritoryId, Node>();

  constructor(scene: Phaser.Scene, onSelect: (id: TerritoryId) => void) {
    const pos = new Map(TERRITORIES.map((t) => [t.id, mapPosition(t)]));

    const lines = scene.add.graphics().lineStyle(2, 0xf0dca8, 0.35);
    for (const [a, b] of BORDERS) {
      lines.lineBetween(pos.get(a)!.x, pos.get(a)!.y, pos.get(b)!.x, pos.get(b)!.y);
    }

    for (const def of TERRITORIES) {
      const { x, y } = pos.get(def.id)!;
      const ring = scene.add.circle(x, y, RADIUS + 4).setStrokeStyle(3, COLORS.selected).setVisible(false);
      const castle = scene.add.image(x - 15, y + 7, 'castle_icon').setScale(0.8);
      const shield = addTinted(scene, x, y, 'shield', COLORS.neutral);
      shield
        .setSize(RADIUS * 2 + 8, RADIUS * 2 + 8)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => onSelect(def.id));
      scene.add
        .text(x, y + RADIUS + 3, def.name, textStyle(10, '#f4e4bc', { stroke: '#000', strokeThickness: 3 }))
        .setOrigin(0.5, 0)
        .setDepth(1); // below the army banners and counts (depth 2)
      const banner = addTinted(scene, x + 22, y - 14, 'banner', COLORS.neutral).setDepth(2);
      const bannerText = scene.add
        .text(x + 38, y - 16, '', textStyle(9, '#ffffff', { stroke: '#000', strokeThickness: 3 }))
        .setOrigin(0, 0.5)
        .setDepth(2);
      this.nodes.set(def.id, { ring, shield, castle, banner, bannerText });
    }
  }

  refresh(state: GameState, selected: TerritoryId | null, attackable: ReadonlySet<TerritoryId>): void {
    const armies = new Map(
      Object.values(state.lords)
        .filter((l) => l.alive && strength(l.army) > 0)
        .map((l) => [l.armyAt, l]),
    );
    for (const [id, node] of this.nodes) {
      const territory = state.territories[id];
      setTintColor(node.shield, lordColor(territory.owner));
      node.castle.setVisible(territory.castle);

      if (id === selected) node.ring.setVisible(true).setStrokeStyle(3, COLORS.selected);
      else if (attackable.has(id)) node.ring.setVisible(true).setStrokeStyle(2, COLORS.attackable);
      else node.ring.setVisible(false);

      const army = armies.get(id);
      node.banner.setVisible(!!army);
      if (army) setTintColor(node.banner, lordColor(army.id));
      node.bannerText.setVisible(!!army).setText(army ? String(strength(army.army)) : '');
    }
  }
}
