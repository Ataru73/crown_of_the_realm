import Phaser from 'phaser';
import { strength } from '../model/army';
import { BORDERS, TERRITORIES, type TerritoryDef } from '../model/map';
import type { GameState, TerritoryId } from '../model/types';
import { COLORS, lordColor, textStyle } from './theme';

const RADIUS = 13;

/** Maps data coordinates onto the map area left of the side panel. */
export function mapPosition(def: TerritoryDef): { x: number; y: number } {
  return { x: 26 + (def.x - 130) * 1.08, y: 16 + def.y * 0.86 };
}

interface Node {
  ring: Phaser.GameObjects.Arc;
  circle: Phaser.GameObjects.Arc;
  castle: Phaser.GameObjects.Rectangle;
  flag: Phaser.GameObjects.Triangle;
  flagText: Phaser.GameObjects.Text;
}

/** Territories as colored nodes joined by borders; click one to select it. */
export class MapView {
  private readonly nodes = new Map<TerritoryId, Node>();

  constructor(scene: Phaser.Scene, onSelect: (id: TerritoryId) => void) {
    const pos = new Map(TERRITORIES.map((t) => [t.id, mapPosition(t)]));

    const lines = scene.add.graphics().lineStyle(2, 0xc8b88a, 0.5);
    for (const [a, b] of BORDERS) {
      lines.lineBetween(pos.get(a)!.x, pos.get(a)!.y, pos.get(b)!.x, pos.get(b)!.y);
    }

    for (const def of TERRITORIES) {
      const { x, y } = pos.get(def.id)!;
      const ring = scene.add.circle(x, y, RADIUS + 4).setStrokeStyle(3, COLORS.selected).setVisible(false);
      const circle = scene.add
        .circle(x, y, RADIUS, COLORS.neutral)
        .setStrokeStyle(2, 0x1a1a1a)
        .setInteractive({
          hitArea: new Phaser.Geom.Circle(RADIUS, RADIUS, RADIUS + 4),
          hitAreaCallback: Phaser.Geom.Circle.Contains,
          useHandCursor: true,
        })
        .on('pointerup', () => onSelect(def.id));
      const castle = scene.add.rectangle(x, y, 8, 8, 0x2a2a2a).setStrokeStyle(1, 0xffffff);
      scene.add
        .text(x, y + RADIUS + 2, def.name, textStyle(10, '#f4e4bc', { stroke: '#000', strokeThickness: 3 }))
        .setOrigin(0.5, 0);
      const flag = scene.add.triangle(x + 16, y - 16, 0, 0, 0, 10, 12, 5).setStrokeStyle(1, 0x000000);
      const flagText = scene.add
        .text(x + 30, y - 16, '', textStyle(9, '#ffffff', { stroke: '#000', strokeThickness: 3 }))
        .setOrigin(0, 0.5);
      this.nodes.set(def.id, { ring, circle, castle, flag, flagText });
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
      node.circle.setFillStyle(lordColor(territory.owner));
      node.castle.setVisible(territory.castle);

      if (id === selected) node.ring.setVisible(true).setStrokeStyle(3, COLORS.selected);
      else if (attackable.has(id)) node.ring.setVisible(true).setStrokeStyle(2, COLORS.attackable);
      else node.ring.setVisible(false);

      const army = armies.get(id);
      node.flag.setVisible(!!army).setFillStyle(lordColor(army?.id ?? null));
      node.flagText.setVisible(!!army).setText(army ? String(strength(army.army)) : '');
    }
  }
}
