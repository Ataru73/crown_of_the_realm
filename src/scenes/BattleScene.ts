import Phaser from 'phaser';
import { SceneKeys, WIDTH } from '../config';
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
import { addBackdrop, addTinted } from '../ui/assets';
import { lordColor, textStyle } from '../ui/theme';
import { playMusic, sfx } from '../ui/audio';

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
/** Keys 1 to 5 pick the tactics. */
const DIGITS = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'];

export class BattleScene extends Phaser.Scene {
  private state!: GameState;
  private target!: TerritoryId;
  private battle!: Battle;
  private troops!: Phaser.GameObjects.Container;
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
    playMusic(this, 'battle');
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
    addBackdrop(this, 'battle');
    if (this.battle.castle) {
      // The castle stands behind the defenders.
      this.add.tileSprite(470, GROUND_Y + 22, WIDTH - 470, 44, 'stone').setOrigin(0, 1);
      this.add.image(560, GROUND_Y + 24, 'keep').setOrigin(0.5, 1).setScale(0.75);
    }
    this.troops = this.add.container(0, 0);
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
      const button = new Button(this, x, 362, label, () => (t === 'auto' ? this.autoResolve() : this.play(t)), {
        ...opts,
        keys: [DIGITS[i], `NUMPAD_${DIGITS[i]}`],
        keyLabel: String(i + 1),
      });
      button.on('pointerover', () =>
        this.hintText.setText(t === 'auto' ? 'Let your captains fight it out.' : TACTIC_HINTS[t]),
      );
      button.on('pointerout', () => this.hintText.setText(''));
      this.buttons[t] = button;
    });
  }

  /** Places one figure per man (up to a cap), knights in front, catapults behind. */
  private drawArmy(army: Army, x0: number, dir: 1 | -1, color: number): void {
    const figures: { key: string; x: number; y: number }[] = [];
    const soldiers = Math.min(army.soldiers, 80);
    const knights = Math.min(army.knights, 20);
    for (let i = 0; i < knights; i++) {
      figures.push({ key: 'knight', x: x0 + dir * (Math.floor(i / 5) * 18), y: 202 + (i % 5) * 18 });
    }
    const start = x0 + dir * (Math.ceil(knights / 5) * 18 + 14);
    for (let i = 0; i < soldiers; i++) {
      figures.push({ key: 'soldier', x: start + dir * (Math.floor(i / 8) * 9), y: 194 + (i % 8) * 12 });
    }
    for (let i = 0; i < Math.min(army.catapults, 6); i++) {
      const x = x0 - dir * (24 + i * 4);
      const y = 282 - i * 14;
      this.troops.add(this.add.image(x, y, 'catapult').setOrigin(0.5, 1).setScale(0.3 * dir, 0.3));
    }
    // Nearer (lower) figures overlap the ones behind them.
    figures.sort((a, b) => a.y - b.y);
    for (const f of figures) {
      this.troops.add(addTinted(this, f.x, f.y, f.key, color, { x: f.key === 'knight' ? 12 : 5, y: f.key === 'knight' ? 30 : 22 }).setScale(dir, 1));
    }
  }

  private redraw(): void {
    const b = this.battle;
    this.troops.removeAll(true);
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
    if (tactic !== 'retreat') {
      this.cameras.main.shake(120, 0.004);
      sfx(this, tactic === 'bombard' ? 'impact' : 'drum');
      if (tactic !== 'bombard') sfx(this, 'sword_clash', { volume: 0.3, delay: 0.1 });
    }
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
    sfx(this, b.attackerWon ? 'horn' : 'groan');
    const title = b.attackerWon ? 'Victory!' : strength(b.attacker) > 0 ? 'You Fall Back' : 'Your Army Is Destroyed';
    this.add
      .text(WIDTH / 2, 120, title, textStyle(34, '#ffe9a0', { stroke: '#000', strokeThickness: 6 }))
      .setOrigin(0.5);
    if (note) this.reportText.setText(note);
    new Button(this, WIDTH / 2, 362, 'Return to Map', () =>
      this.scene.start(SceneKeys.Map, { conquest: { target: this.target, result: battleResult(b) } }),
    { keys: ['ENTER', 'SPACE'] });
  }
}
