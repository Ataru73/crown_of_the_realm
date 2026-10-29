import Phaser from 'phaser';
import { SceneKeys, WIDTH } from '../config';
import { session } from '../game/session';
import { territoryDef } from '../model/map';
import { HEROES, newGame, type Hero } from '../model/setup';
import { playerLord } from '../model/state';
import { drawPlaceholder } from '../ui/placeholder';
import { COLORS, textStyle } from '../ui/theme';

const CARD_W = 140;
const CARD_H = 190;

function statLine(label: string, value: number): string {
  return `${label.padEnd(11)} ${'●'.repeat(value)}${'○'.repeat(5 - value)}`;
}

export class HeroSelectScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.HeroSelect);
  }

  create(): void {
    drawPlaceholder(this, 0x2a1a3a, 'Choose Your Hero', 'Each Saxon lord has different strengths.');
    const gap = (WIDTH - CARD_W * HEROES.length) / (HEROES.length + 1);
    HEROES.forEach((hero, i) => this.addCard(hero, gap + CARD_W / 2 + i * (CARD_W + gap), 220));
  }

  private addCard(hero: Hero, x: number, y: number): void {
    const bg = this.add.rectangle(0, 0, CARD_W, CARD_H, COLORS.parchment).setStrokeStyle(2, COLORS.border);
    const portrait = this.add.rectangle(0, -45, 80, 70, 0x6a5a40);
    const name = this.add
      .text(0, 10, hero.name, textStyle(14, '#3a2210', { align: 'center', wordWrap: { width: CARD_W - 16 } }))
      .setOrigin(0.5, 0);
    const stats = this.add
      .text(
        0,
        52,
        [
          statLine('Leadership', hero.stats.leadership),
          statLine('Jousting', hero.stats.jousting),
          statLine('Swordplay', hero.stats.swordplay),
        ].join('\n'),
        { fontFamily: 'monospace', fontSize: '10px', color: '#3a2210', lineSpacing: 3 },
      )
      .setOrigin(0.5, 0);

    this.add
      .container(x, y, [bg, portrait, name, stats])
      .setSize(CARD_W, CARD_H)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => bg.setFillStyle(COLORS.parchmentLight))
      .on('pointerout', () => bg.setFillStyle(COLORS.parchment))
      .on('pointerup', () => this.choose(hero));
  }

  private choose(hero: Hero): void {
    const state = newGame(hero.id, Date.now() >>> 0);
    session.start(state);
    const home = territoryDef(playerLord(state).home).name;
    this.scene.start(SceneKeys.Cutscene, {
      text: `${hero.name} rides from ${home} to rally the Saxons against the Norman invaders...`,
      next: SceneKeys.Map,
    });
  }
}
