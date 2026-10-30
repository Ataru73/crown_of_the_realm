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
import { addBackdrop, addTinted, setTintedFrame } from '../ui/assets';
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

/** Keys 1 to 5 pick the tactics. */
const DIGITS = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'];

type UnitFrame = 'rest' | 'stride' | 'attack';
/** Each unit's frames (`<unit>_<name>`) and the point between its feet in each. */
const UNIT_FRAMES: Record<'soldier' | 'knight', Record<UnitFrame, { name: string; x: number; y: number }>> = {
  soldier: {
    rest: { name: 'march', x: 4, y: 22 },
    stride: { name: 'stride', x: 6, y: 22 },
    attack: { name: 'attack', x: 8, y: 17 },
  },
  knight: {
    rest: { name: 'ride', x: 11, y: 37 },
    stride: { name: 'stride', x: 14, y: 37 },
    attack: { name: 'attack', x: 12, y: 23 },
  },
};
/** How long the armies take to close and strike in each round. */
const CLASH_MS = 700;
/** The share of the clash spent marching; the rest is the blow. */
const MARCH_SHARE = 0.65;
/** How far each kind of figure advances; in a charge the knights ride out past the foot. */
const ADVANCE = { soldier: 18, knight: 26, charge: 110 };

interface Figure {
  unit: 'soldier' | 'knight';
  sprite: Phaser.GameObjects.Container;
  x: number;
  dir: 1 | -1;
  frame: UnitFrame;
}

/** The attacker picks a tactic each round until one side breaks. */
export class BattleScene extends Phaser.Scene {
  private state!: GameState;
  private target!: TerritoryId;
  private battle!: Battle;
  private troops!: Phaser.GameObjects.Container;
  private figures: Figure[] = [];
  private clashing = false;
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
    this.figures = [];
    this.clashing = false;

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
    const figures: { unit: 'soldier' | 'knight'; x: number; y: number }[] = [];
    const soldiers = Math.min(army.soldiers, 80);
    const knights = Math.min(army.knights, 20);
    for (let i = 0; i < knights; i++) {
      figures.push({ unit: 'knight', x: x0 + dir * (Math.floor(i / 5) * 18), y: 202 + (i % 5) * 18 });
    }
    const start = x0 + dir * (Math.ceil(knights / 5) * 18 + 14);
    for (let i = 0; i < soldiers; i++) {
      figures.push({ unit: 'soldier', x: start + dir * (Math.floor(i / 8) * 9), y: 194 + (i % 8) * 12 });
    }
    for (let i = 0; i < Math.min(army.catapults, 6); i++) {
      const x = x0 - dir * (24 + i * 4);
      const y = 282 - i * 14;
      this.troops.add(this.add.image(x, y, 'catapult').setOrigin(0.5, 1).setScale(0.3 * dir, 0.3));
    }
    // Nearer (lower) figures overlap the ones behind them.
    figures.sort((a, b) => a.y - b.y);
    for (const f of figures) {
      const rest = UNIT_FRAMES[f.unit].rest;
      const sprite = addTinted(this, f.x, f.y, `${f.unit}_${rest.name}`, color, rest).setScale(dir, 1);
      this.troops.add(sprite);
      this.figures.push({ unit: f.unit, sprite, x: f.x, dir, frame: 'rest' });
    }
  }

  private pose(f: Figure, frame: UnitFrame): void {
    if (f.frame === frame) return;
    const def = UNIT_FRAMES[f.unit][frame];
    setTintedFrame(f.sprite, `${f.unit}_${def.name}`, def);
    f.frame = frame;
  }

  /** Both armies march at each other and strike, then `done` shows the losses. */
  private clash(tactic: 'advance' | 'charge', done: () => void): void {
    this.clashing = true;
    for (const button of Object.values(this.buttons)) button?.setEnabled(false);
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: CLASH_MS,
      onUpdate: (tween) => {
        const t = tween.getValue() ?? 0;
        const march = Math.min(1, t / MARCH_SHARE);
        this.figures.forEach((f, i) => {
          const charging = tactic === 'charge' && f.unit === 'knight' && f.dir === 1;
          const reach = charging ? ADVANCE.charge : ADVANCE[f.unit];
          f.sprite.setX(f.x + f.dir * reach * Phaser.Math.Easing.Sine.Out(march));
          // Neighbours step out of time with each other.
          this.pose(f, t >= MARCH_SHARE ? 'attack' : Math.floor(march * 6 + i) % 2 ? 'stride' : 'rest');
        });
      },
      onComplete: () => {
        this.clashing = false;
        done();
      },
    });
  }

  private redraw(): void {
    const b = this.battle;
    this.troops.removeAll(true);
    this.figures = [];
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
    if (this.battle.over || this.clashing) return;
    const r = withRng(this.state, (rng) => fightRound(this.battle, tactic, rng));
    const settle = () => {
      this.report(r);
      this.redraw();
      if (this.battle.over) this.finish();
    };
    if (tactic === 'retreat') {
      settle();
    } else if (tactic === 'bombard') {
      // The men hold their ground while the catapults fire.
      this.cameras.main.shake(120, 0.004);
      sfx(this, 'impact');
      settle();
    } else {
      sfx(this, 'drum');
      this.clash(tactic, () => {
        this.cameras.main.shake(120, 0.004);
        sfx(this, 'sword_clash', { volume: 0.4 });
        settle();
      });
    }
  }

  private autoResolve(): void {
    if (this.clashing) return;
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
