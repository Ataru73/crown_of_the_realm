import Phaser from 'phaser';
import { HEIGHT, SceneKeys, WIDTH } from '../config';
import { session } from '../game/session';
import { playerLord } from '../model/state';
import {
  ENTER_MS,
  parry,
  RAID_GUARDS,
  RESCUE_GUARDS,
  startFight,
  strike,
  STAGGER_MS,
  SWING_MS,
  tickFight,
  windupMs,
  type Fight,
  type SwordEvent,
} from '../model/sword';
import { withRng } from '../model/turn';
import type { GameState, Lord, LordId } from '../model/types';
import { Button } from '../ui/Button';
import { lordColor, textStyle } from '../ui/theme';

export type SwordMission = { mission: 'raid'; target: LordId } | { mission: 'rescue' };

const FLOOR_Y = 300;
const HERO_X = 250;
const GUARD_X = 390;
const ENTER_FROM_X = WIDTH + 60;

/** Sword angles in degrees: 0 points straight up, positive leans toward the foe. */
const POSE = { idle: 35, raised: -75, struck: 115, parry: 5 };
/** How long a guard's blade stays down after he strikes. */
const SLASH_MS = 200;

interface Fighter {
  body: Phaser.GameObjects.Container;
  sword: Phaser.GameObjects.Container;
}

/** A side-on duel down a castle corridor, one guard after another. */
export class SwordScene extends Phaser.Scene {
  private state!: GameState;
  private player!: Lord;
  private foe!: Lord;
  private mission!: SwordMission;
  private fight!: Fight;
  private finished = false;
  private slash = 0;

  private hero!: Fighter;
  private guard!: Fighter;
  private warning!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private messageText!: Phaser.GameObjects.Text;
  private heroPips!: Phaser.GameObjects.Graphics;
  private controls: Button[] = [];

  constructor() {
    super(SceneKeys.Sword);
  }

  create(data: SwordMission): void {
    if (!session.state) {
      this.scene.start(SceneKeys.Title);
      return;
    }
    this.state = session.state;
    this.mission = data;
    this.player = playerLord(this.state);
    const kidnap = this.state.kidnap;
    if (data.mission === 'rescue' && !kidnap) {
      this.scene.start(SceneKeys.Map);
      return;
    }
    this.foe = this.state.lords[data.mission === 'raid' ? data.target : kidnap!.captor];
    this.fight = startFight(
      this.player.stats.swordplay,
      this.foe.stats.swordplay,
      data.mission === 'raid' ? RAID_GUARDS : RESCUE_GUARDS,
    );
    this.finished = false;
    this.slash = 0;

    this.drawCorridor();
    this.hero = this.drawFighter(lordColor(this.player.id), 1);
    this.guard = this.drawFighter(lordColor(this.foe.id), -1);
    this.hero.body.setPosition(HERO_X, FLOOR_Y);
    this.warning = this.add
      .text(GUARD_X, FLOOR_Y - 150, '!', textStyle(30, '#ffdd44', { stroke: '#000', strokeThickness: 5 }))
      .setOrigin(0.5)
      .setVisible(false);
    this.drawUi();
    this.render();
  }

  private drawCorridor(): void {
    const g = this.add.graphics();
    g.fillStyle(0x34323c).fillRect(0, 0, WIDTH, FLOOR_Y);
    // Stone courses with staggered joints.
    g.lineStyle(1, 0x24222a);
    for (let y = 0, row = 0; y < FLOOR_Y; y += 22, row++) {
      g.lineBetween(0, y, WIDTH, y);
      for (let x = (row % 2) * 24; x < WIDTH; x += 48) g.lineBetween(x, y, x, y + 22);
    }
    // Arched doorways down the corridor.
    for (const x of [70, 570]) {
      g.fillStyle(0x15141a).fillRect(x - 34, 150, 68, FLOOR_Y - 150).fillCircle(x, 150, 34);
    }
    g.fillStyle(0x4a3828).fillRect(0, FLOOR_Y, WIDTH, HEIGHT - FLOOR_Y);
    g.lineStyle(1, 0x3a2a1e);
    for (let x = 0; x < WIDTH; x += 40) g.lineBetween(x, FLOOR_Y, x - 30, HEIGHT);
    // Torches.
    for (const x of [175, 465]) {
      g.fillStyle(0x5a3a1a).fillRect(x - 3, 120, 6, 26);
      const flame = this.add.ellipse(x, 112, 14, 22, 0xffa830);
      this.tweens.add({
        targets: flame,
        scaleY: 0.75,
        scaleX: 1.15,
        duration: 140 + (x % 70),
        yoyo: true,
        repeat: -1,
      });
    }
  }

  /**
   * A swordsman facing right (`facing` 1) or left (-1); the body's origin is
   * between his feet, the sword's origin is his sword hand.
   */
  private drawFighter(color: number, facing: 1 | -1): Fighter {
    const g = this.add.graphics();
    g.fillStyle(0x2a2a30).fillRect(-14, -50, 10, 50).fillRect(4, -50, 10, 50);
    g.fillStyle(color).fillRect(-18, -110, 36, 64);
    g.fillStyle(0x9a9aa2).fillRect(-18, -60, 36, 8);
    g.fillStyle(0xe0b890).fillCircle(0, -124, 13);
    g.fillStyle(0x9a9aa2).fillRect(-14, -140, 28, 14);
    // Shield on the far arm.
    g.fillStyle(color).fillRect(-30, -102, 14, 40);
    g.lineStyle(2, 0xffffff).strokeRect(-30, -102, 14, 40);

    const blade = this.add.graphics();
    blade.fillStyle(0xd0d0d8).fillRect(-2, -70, 4, 66);
    blade.fillStyle(0x8a6a30).fillRect(-9, -6, 18, 4).fillRect(-2, -2, 4, 10);
    const sword = this.add.container(20, -84, [blade]);
    const body = this.add.container(ENTER_FROM_X, FLOOR_Y, [g, sword]).setScale(facing, 1);
    return { body, sword };
  }

  private drawUi(): void {
    const style = textStyle(13, '#ffffff', { stroke: '#000', strokeThickness: 3 });
    const title =
      this.mission.mission === 'raid'
        ? `Raid on ${this.foe.name}'s castle`
        : `Rescue ${this.state.kidnap!.lady} from ${this.foe.name}`;
    this.add.text(WIDTH / 2, 6, title, style).setOrigin(0.5, 0);
    this.statusText = this.add.text(WIDTH / 2, 24, '', style).setOrigin(0.5, 0);
    this.heroPips = this.add.graphics();
    this.messageText = this.add
      .text(WIDTH / 2, 52, 'Strike while he winds up or reels; parry just before his blow lands.', textStyle(13, '#ffe9a0', {
        stroke: '#000',
        strokeThickness: 3,
        align: 'center',
      }))
      .setOrigin(0.5, 0);
    this.add
      .text(WIDTH / 2, 386, 'Keys: A or Space to strike · D or Shift to parry', textStyle(11, '#cccccc'))
      .setOrigin(0.5);

    const opts = { width: 150, height: 30, fontSize: 15, onPress: true };
    this.controls = [
      new Button(this, WIDTH / 2 - 90, 350, 'Strike', () => this.act('strike'), opts),
      new Button(this, WIDTH / 2 + 90, 350, 'Parry', () => this.act('parry'), opts),
    ];
    const kb = this.input.keyboard;
    kb?.on('keydown-A', () => this.act('strike'));
    kb?.on('keydown-SPACE', () => this.act('strike'));
    kb?.on('keydown-D', () => this.act('parry'));
    kb?.on('keydown-SHIFT', () => this.act('parry'));
  }

  private act(move: 'strike' | 'parry'): void {
    if (this.finished) return;
    if (move === 'strike') strike(this.fight);
    else parry(this.fight);
  }

  update(_time: number, delta: number): void {
    if (!this.fight || this.finished) return;
    // Long frames (a background tab) are split so no timing window is skipped.
    for (let left = Math.min(delta, 250); left > 0; left -= 20) {
      withRng(this.state, (rng) => tickFight(this.fight, Math.min(20, left), rng));
    }
    this.slash = Math.max(0, this.slash - delta);
    for (const e of this.fight.events.splice(0)) this.show(e);
    this.render();
  }

  /** Poses both fighters from the fight's phases and timers. */
  private render(): void {
    const f = this.fight;
    const h = f.hero;
    let heroAngle = POSE.idle;
    let heroX = HERO_X;
    if (h.phase === 'swing') heroAngle = Phaser.Math.Linear(POSE.raised, POSE.struck, 1 - h.timer / SWING_MS);
    else if (h.phase === 'parry') {
      heroAngle = POSE.parry;
      heroX += 6;
    } else if (h.phase === 'recover') heroAngle = POSE.struck - 30;
    else if (h.phase === 'hit') heroX -= 10;
    this.hero.sword.setAngle(heroAngle);
    this.hero.body.setX(heroX);

    const g = f.guard;
    let x = GUARD_X;
    let angle = POSE.idle;
    let lean = 0;
    let alpha = 1;
    switch (g.phase) {
      case 'enter':
        x = Phaser.Math.Linear(ENTER_FROM_X, GUARD_X, 1 - g.timer / ENTER_MS);
        break;
      case 'windup':
        angle = Phaser.Math.Linear(POSE.idle, POSE.raised, Math.min(1, 1.6 * (1 - g.timer / windupMs(f.level))));
        break;
      case 'stagger':
        x += 18 * (g.timer / STAGGER_MS);
        lean = -10;
        angle = -20;
        break;
      case 'down':
        lean = -80;
        alpha = Math.max(0, g.timer / ENTER_MS);
        break;
    }
    if (this.slash > 0) angle = POSE.struck;
    // The guard faces left, so his angles are mirrored by the container's scale.
    this.guard.sword.setAngle(angle);
    this.guard.body.setPosition(x, FLOOR_Y).setAngle(-lean).setAlpha(alpha);
    this.warning.setVisible(g.phase === 'windup').setX(x);

    const n = f.guardHps.length;
    const who = f.guardIndex === n - 1 ? (this.mission.mission === 'rescue' ? this.foe.name : 'the captain') : 'a guard';
    this.statusText.setText(`Guard ${f.guardIndex + 1} of ${n}: ${who}   ·   his wounds ${g.maxHp - Math.max(0, g.hp)}/${g.maxHp}`);

    this.heroPips.clear();
    for (let i = 0; i < f.heroMaxHp; i++) {
      this.heroPips.fillStyle(i < f.heroHp ? 0xd03030 : 0x402020).fillCircle(20 + i * 18, 30, 7);
    }
  }

  private spark(x: number, y: number, color = 0xffffcc): void {
    const s = this.add.star(x, y, 6, 4, 14, color);
    this.tweens.add({ targets: s, scale: 1.8, alpha: 0, duration: 250, onComplete: () => s.destroy() });
  }

  private say(text: string): void {
    this.messageText.setText(text);
  }

  private show(e: SwordEvent): void {
    const clashX = (HERO_X + GUARD_X) / 2;
    switch (e.type) {
      case 'hit':
        this.spark(GUARD_X - 10, FLOOR_Y - 90, 0xff5040);
        this.say(e.down ? 'He falls!' : 'A telling blow!');
        break;
      case 'blocked':
        this.spark(clashX, FLOOR_Y - 120);
        this.say('Blocked! Wait for an opening.');
        break;
      case 'parried':
        this.spark(clashX, FLOOR_Y - 130);
        this.say('Parried! Strike now!');
        break;
      case 'wounded':
        this.slash = SLASH_MS;
        this.cameras.main.shake(180, 0.01);
        this.cameras.main.flash(150, 160, 20, 20);
        this.say('You are wounded!');
        break;
      case 'nextGuard':
        this.say(this.fight.guardIndex === this.fight.guardHps.length - 1 && this.mission.mission === 'rescue'
          ? `${this.foe.name} himself bars the way!`
          : 'Another guard comes running!');
        break;
      case 'over':
        this.finish(e.won);
        break;
    }
  }

  private finish(won: boolean): void {
    this.finished = true;
    this.controls.forEach((b) => b.destroy());
    this.warning.setVisible(false);
    const rescue = this.mission.mission === 'rescue';
    const lady = this.state.kidnap?.lady;
    this.add
      .text(WIDTH / 2, 150, won ? 'Victory!' : 'Defeat', textStyle(34, '#ffe9a0', { stroke: '#000', strokeThickness: 6 }))
      .setOrigin(0.5);
    if (won) this.say(rescue ? `The way is clear: ${lady} is free!` : 'The way to the treasury is clear!');
    else this.say(rescue ? 'You are beaten back from the keep.' : 'You are beaten back and flee the castle.');
    this.time.delayedCall(600, () => {
      new Button(this, WIDTH / 2, 350, 'Return to Map', () =>
        this.scene.start(SceneKeys.Map, this.mission.mission === 'raid'
          ? { raid: { target: this.mission.target, won } }
          : { rescue: { won } }),
      );
    });
  }
}
