import Phaser from 'phaser';
import { HEIGHT, SceneKeys, WIDTH } from '../config';
import { session } from '../game/session';
import { battleInput } from '../model/actions';
import { strength } from '../model/army';
import {
  autoTactic,
  availableTactics,
  battleResult,
  fightRound,
  startBattle,
  type Battle,
  type RoundReport,
  type Tactic,
} from '../model/combat';
import { territoryDef } from '../model/map';
import { applySiege, type SiegeResult } from '../model/siege';
import { playerLord } from '../model/state';
import { withRng } from '../model/turn';
import type { Army, GameState, TerritoryId } from '../model/types';
import { Button } from '../ui/Button';
import { lordColor, textStyle } from '../ui/theme';

const GROUND_Y = 170;
const TACTIC_LABELS: Record<Tactic, string> = {
  advance: 'Advance',
  charge: 'Charge',
  bombard: 'Bombard',
  retreat: 'Retreat',
};
const TACTIC_HINTS: Record<Tactic, string> = {
  advance: 'An even exchange of blows.',
  charge: 'Knights strike twice as hard, but lead the way and fall first.',
  bombard: 'Catapults fire over the walls; the defenders can barely answer.',
  retreat: 'Withdraw with the men still standing.',
};

function describeLosses(a: Army): string {
  const parts = [];
  if (a.soldiers) parts.push(`${a.soldiers} soldier${a.soldiers === 1 ? '' : 's'}`);
  if (a.knights) parts.push(`${a.knights} knight${a.knights === 1 ? '' : 's'}`);
  return parts.length ? parts.join(' and ') : 'no one';
}

/** The attacker picks a tactic each round until one side breaks. */
export class BattleScene extends Phaser.Scene {
  private state!: GameState;
  private target!: TerritoryId;
  private battle!: Battle;
  private troops!: Phaser.GameObjects.Graphics;
  private roundText!: Phaser.GameObjects.Text;
  private countText!: { attacker: Phaser.GameObjects.Text; defender: Phaser.GameObjects.Text };
  private reportText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private buttons: Partial<Record<Tactic | 'auto', Button>> = {};
  private attackerColor = 0xffffff;
  private defenderColor = 0xffffff;

  constructor() {
    super(SceneKeys.Battle);
  }

  /** `siege`: the siege fought before this assault, if any. */
  create(data: { target: TerritoryId; siege?: SiegeResult }): void {
    if (!session.state) {
      this.scene.start(SceneKeys.Title);
      return;
    }
    this.state = session.state;
    this.target = data.target;
    const player = playerLord(this.state);
    const input = battleInput(this.state, player.id, this.target);
    this.battle = startBattle(data.siege ? applySiege(input, data.siege) : input);
    this.attackerColor = lordColor(player.id);
    this.defenderColor = lordColor(this.state.territories[this.target].owner);
    this.buttons = {};

    this.drawField();
    this.drawUi();
    this.redraw();
    if (this.battle.over) this.finish('The land lies undefended.');
  }

  private drawField(): void {
    this.add.rectangle(0, 0, WIDTH, GROUND_Y, 0x7fa6c8).setOrigin(0);
    this.add.rectangle(0, GROUND_Y, WIDTH, HEIGHT - GROUND_Y, 0x5a7a3a).setOrigin(0);
    if (this.battle.castle) {
      // Placeholder walls behind the defenders.
      const wall = this.add.graphics().fillStyle(0x8a8478).fillRect(470, 70, 150, 110);
      for (let x = 470; x < 620; x += 20) wall.fillRect(x, 58, 12, 12);
      wall.fillStyle(0x3a3530).fillRect(530, 130, 30, 50);
    }
    this.troops = this.add.graphics();
  }

  private drawUi(): void {
    const def = territoryDef(this.target);
    const owner = this.state.territories[this.target].owner;
    const defenderName = owner ? this.state.lords[owner].name : `the vassals of ${def.name}`;
    const big = textStyle(22, '#f4e4bc', { stroke: '#000', strokeThickness: 4 });
    const small = textStyle(12, '#f4e4bc', { stroke: '#000', strokeThickness: 3 });
    this.add.text(WIDTH / 2, 10, `The Battle for ${def.name}`, big).setOrigin(0.5, 0);
    this.add.text(WIDTH / 2, 38, `against ${defenderName}`, small).setOrigin(0.5, 0);
    this.roundText = this.add.text(WIDTH / 2, 56, '', small).setOrigin(0.5, 0);
    this.countText = {
      attacker: this.add.text(20, 290, '', small),
      defender: this.add.text(WIDTH - 20, 290, '', small).setOrigin(1, 0),
    };
    this.reportText = this.add
      .text(WIDTH / 2, 312, '', textStyle(13, '#ffffff', { stroke: '#000', strokeThickness: 3, align: 'center' }))
      .setOrigin(0.5, 0);
    this.hintText = this.add.text(WIDTH / 2, 386, '', textStyle(11, '#f4e4bc', { stroke: '#000', strokeThickness: 3 })).setOrigin(0.5);

    const all: (Tactic | 'auto')[] = ['advance', 'charge', 'bombard', 'retreat', 'auto'];
    const opts = { width: 112, height: 26, fontSize: 13 };
    all.forEach((t, i) => {
      const x = WIDTH / 2 + (i - 2) * 120;
      const label = t === 'auto' ? 'Auto-resolve' : TACTIC_LABELS[t];
      const button = new Button(this, x, 362, label, () => (t === 'auto' ? this.autoResolve() : this.play(t)), opts);
      button.on('pointerover', () =>
        this.hintText.setText(t === 'auto' ? 'Let your captains fight it out.' : TACTIC_HINTS[t]),
      );
      button.on('pointerout', () => this.hintText.setText(''));
      this.buttons[t] = button;
    });
  }

  /** Draws one icon per man (up to a cap), knights larger and in front. */
  private drawArmy(army: Army, x0: number, dir: 1 | -1, color: number): void {
    const g = this.troops;
    const soldiers = Math.min(army.soldiers, 80);
    const knights = Math.min(army.knights, 20);
    for (let i = 0; i < knights; i++) {
      const x = x0 + dir * (Math.floor(i / 5) * 16);
      const y = 190 + (i % 5) * 18;
      g.fillStyle(0x4a3020).fillRect(x - 7, y + 6, 14, 6);
      g.fillStyle(color).fillRect(x - 3, y - 4, 7, 11);
      g.fillStyle(0xdddddd).fillRect(x - 2, y - 8, 5, 4);
    }
    const start = x0 + dir * (Math.ceil(knights / 5) * 16 + 14);
    for (let i = 0; i < soldiers; i++) {
      const x = start + dir * (Math.floor(i / 8) * 9);
      const y = 186 + (i % 8) * 12;
      g.fillStyle(color).fillRect(x - 2, y - 3, 5, 8);
      g.fillStyle(0xe8c8a0).fillRect(x - 1, y - 6, 3, 3);
    }
    for (let i = 0; i < Math.min(army.catapults, 6); i++) {
      const x = x0 - dir * (24 + i * 4);
      const y = 280 - i * 14;
      g.fillStyle(0x6a4a2a).fillRect(x - 8, y - 4, 16, 6);
      g.lineStyle(2, 0x6a4a2a).lineBetween(x, y - 4, x + dir * 8, y - 14);
    }
  }

  private redraw(): void {
    const b = this.battle;
    this.troops.clear();
    this.drawArmy(b.attacker, 60, 1, this.attackerColor);
    this.drawArmy(b.defender, WIDTH - 60, -1, this.defenderColor);

    const walls = b.castle ? `   Castle walls: damage to defenders ÷${Number(b.bonus.toFixed(2))}` : '';
    this.roundText.setText(`Round ${b.round}${walls}`);
    const line = (a: Army) => `${a.soldiers} soldiers  ${a.knights} knights  ·  strength ${strength(a)}`;
    this.countText.attacker.setText(`Your army: ${line(b.attacker)}`);
    this.countText.defender.setText(`Defenders: ${line(b.defender)}`);

    const allowed = new Set(b.over ? [] : availableTactics(b));
    for (const t of ['advance', 'charge', 'bombard', 'retreat'] as Tactic[]) {
      this.buttons[t]?.setEnabled(allowed.has(t));
    }
    this.buttons.auto?.setEnabled(!b.over);
  }

  private report(r: RoundReport): void {
    if (r.tactic === 'retreat') return;
    this.reportText.setText(
      `You ${r.tactic === 'bombard' ? 'bombard the walls' : r.tactic}. ` +
        `You lose ${describeLosses(r.attackerLosses)}; the enemy loses ${describeLosses(r.defenderLosses)}.`,
    );
  }

  private play(tactic: Tactic): void {
    if (this.battle.over) return;
    const r = withRng(this.state, (rng) => fightRound(this.battle, tactic, rng));
    this.report(r);
    if (tactic !== 'retreat') this.cameras.main.shake(120, 0.004);
    this.redraw();
    if (this.battle.over) this.finish();
  }

  private autoResolve(): void {
    while (!this.battle.over) {
      const r = withRng(this.state, (rng) => fightRound(this.battle, autoTactic(this.battle), rng));
      this.report(r);
    }
    this.redraw();
    this.finish();
  }

  private finish(note?: string): void {
    const b = this.battle;
    for (const button of Object.values(this.buttons)) button?.setVisible(false);
    this.hintText.setText('');
    const title = b.attackerWon ? 'Victory!' : strength(b.attacker) > 0 ? 'You Fall Back' : 'Your Army Is Destroyed';
    this.add
      .text(WIDTH / 2, 120, title, textStyle(34, '#ffe9a0', { stroke: '#000', strokeThickness: 6 }))
      .setOrigin(0.5);
    if (note) this.reportText.setText(note);
    new Button(this, WIDTH / 2, 362, 'Return to Map', () =>
      this.scene.start(SceneKeys.Map, { conquest: { target: this.target, result: battleResult(b) } }),
    );
  }
}
