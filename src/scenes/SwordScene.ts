import Phaser from 'phaser';
import { SceneKeys, WIDTH } from '../config';
import { session } from '../game/session';
import { playerLord } from '../model/state';
import {
  ENTER_MS,
  HIT_STUN_MS,
  parry,
  RAID_GUARDS,
  RESCUE_GUARDS,
  rescueStage,
  type RescueStage,
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
import { addBackdrop, addTinted, assetPoint, setTintedFrame } from '../ui/assets';
import { lordColor, textStyle } from '../ui/theme';
import { playMusic, sfx } from '../ui/audio';

export type SwordMission = { mission: 'raid'; target: LordId } | { mission: 'rescue' };

const FLOOR_Y = 328;
const HERO_X = 250;
const GUARD_X = 390;
const ENTER_FROM_X = WIDTH + 60;
/** The torches in the corridor painting. */
const TORCHES = [[163, 140], [477, 140]];
type Fighter = 'swordsman_hero' | 'swordsman_guard';
type SwordAnim = 'idle' | 'step' | 'windup' | 'strike' | 'parry' | 'hit' | 'fall';

/** How long a guard's blade stays down after he strikes. */
const SLASH_MS = 200;
/** How long a guard holds his guard up after blocking a blow. */
const BLOCK_MS = 250;
/** The hero's swing shows the wind-up frame for this share of its time, then the strike. */
const WINDUP_SHARE = 0.4;

interface Swordsman {
  key: Fighter;
  body: Phaser.GameObjects.Container;
  figure: Phaser.GameObjects.Container;
  currentFrame?: string;
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
  private block = 0;

  private hero!: Swordsman;
  private guard!: Swordsman;
  private warning!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private messageText!: Phaser.GameObjects.Text;
  private heroPips!: Phaser.GameObjects.Graphics;
  private controls: Button[] = [];
  private placeText?: Phaser.GameObjects.Text;
  private setting?: RescueStage;
  private scenery: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super(SceneKeys.Sword);
  }

  create(data: SwordMission): void {
    if (!session.state) {
      this.scene.start(SceneKeys.Title);
      return;
    }
    this.state = session.state;
    playMusic(this, 'swordfight');
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
    this.block = 0;

    this.setting = undefined;
    this.drawSetting(data.mission === 'rescue' ? rescueStage(0) : 'castle');
    this.hero = this.drawFighter('swordsman_hero', lordColor(this.player.id), 1);
    this.guard = this.drawFighter('swordsman_guard', lordColor(this.foe.id), -1);
    this.hero.body.setPosition(HERO_X, FLOOR_Y);
    this.warning = this.add
      .text(GUARD_X, FLOOR_Y - 172, '!', textStyle(30, '#ffdd44', { stroke: '#000', strokeThickness: 5 }))
      .setOrigin(0.5)
      .setVisible(false);
    this.drawUi();
    this.render();
  }

  /** Paints the gate (outside the walls), the court (a great hall) or the castle (its corridors); fighters are drawn above at depth 0. */
  private drawSetting(setting: RescueStage): void {
    if (this.setting === setting) return;
    this.setting = setting;
    for (const o of this.scenery) o.destroy();
    this.scenery = [];
    const keep = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.scenery.push(o);
      (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(-10);
      return o;
    };
    if (setting !== 'castle' && this.textures.exists(setting)) {
      keep(addBackdrop(this, setting));
      return;
    }
    keep(addBackdrop(this, 'corridor'));
    if (setting === 'court') {
      // Until the court painting exists: the corridor lit as a hall, with a carpet to the dais.
      keep(this.add.rectangle(0, 0, WIDTH, FLOOR_Y + 30, 0x401020, 0.28).setOrigin(0));
      keep(this.add.rectangle(0, FLOOR_Y + 4, WIDTH, 26, 0x8a1c24).setOrigin(0));
      keep(this.add.rectangle(0, FLOOR_Y + 4, WIDTH, 3, 0xd8b040).setOrigin(0));
      return;
    }
    // The painted torches flicker.
    for (const [x, y] of TORCHES) {
      const glow = keep(this.add.ellipse(x, y, 40, 52, 0xffa830, 0.22).setBlendMode(Phaser.BlendModes.ADD));
      this.tweens.add({
        targets: glow,
        scaleY: 0.8,
        scaleX: 1.15,
        alpha: 0.12,
        duration: 140 + (x % 70),
        yoyo: true,
        repeat: -1,
      });
    }
  }

  /** Fades out and in again while the hero moves on to the next setting of the rescue. */
  private moveTo(setting: RescueStage): void {
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.drawSetting(setting);
      this.cameras.main.fadeIn(300, 0, 0, 0);
    });
  }

  /**
   * A swordsman facing right (`facing` 1) or left (-1), his tunic in `color`;
   * the body's origin is on the floor under him.
   */
  private drawFighter(key: Fighter, color: number, facing: 1 | -1): Swordsman {
    const origin = assetPoint(`${key}_idle_0`, 'feet');
    const figure = addTinted(this, 0, 0, `${key}_idle_0`, color, origin);
    const body = this.add.container(ENTER_FROM_X, FLOOR_Y, [figure]).setScale(facing, 1);
    const fighter: Swordsman = { key, body, figure };
    this.pose(fighter, 'idle', 0);
    return fighter;
  }

  /** Shows the rendered `anim` frame with its feet anchored on the floor. */
  private pose(f: Swordsman, anim: SwordAnim, frame: number): void {
    const key = `${f.key}_${anim}_${frame}`;
    if (f.currentFrame !== key) {
      setTintedFrame(f.figure, key, assetPoint(key, 'feet'));
      f.currentFrame = key;
    }
  }

  /** Returns the world coordinate of the fighter's sword tip. */
  private getTip(f: Swordsman): { x: number; y: number } {
    const key = f.currentFrame || `${f.key}_idle_0`;
    const tip = assetPoint(key, 'tip');
    const feet = assetPoint(key, 'feet');
    const dir = f.body.scaleX;
    return {
      x: f.body.x + dir * (tip.x - feet.x),
      y: f.body.y + (tip.y - feet.y),
    };
  }

  private drawUi(): void {
    const style = textStyle(13, '#ffffff', { stroke: '#000', strokeThickness: 3 });
    const title =
      this.mission.mission === 'raid'
        ? `Raid on ${this.foe.name}'s castle`
        : `Rescue ${this.state.kidnap!.lady} from ${this.foe.name}`;
    this.add.text(WIDTH / 2, 6, title, style).setOrigin(0.5, 0);
    if (this.mission.mission === 'rescue') {
      this.placeText = this.add.text(WIDTH - 8, 6, '', style).setOrigin(1, 0);
    }
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
      .text(WIDTH / 2, 391, 'Keys: A or Space to strike · D or Shift to parry', textStyle(11, '#cccccc'))
      .setOrigin(0.5);

    const opts = { width: 150, height: 30, fontSize: 15, onPress: true };
    this.controls = [
      new Button(this, WIDTH / 2 - 90, 364, 'Strike', () => this.act('strike'), opts),
      new Button(this, WIDTH / 2 + 90, 364, 'Parry', () => this.act('parry'), opts),
    ];
    const kb = this.input.keyboard;
    kb?.on('keydown-A', () => this.act('strike'));
    kb?.on('keydown-SPACE', () => this.act('strike'));
    kb?.on('keydown-D', () => this.act('parry'));
    kb?.on('keydown-SHIFT', () => this.act('parry'));
  }

  private act(move: 'strike' | 'parry'): void {
    if (this.finished) return;
    if (move === 'strike') {
      strike(this.fight);
      sfx(this, 'swing', { volume: 0.5 });
    } else parry(this.fight);
  }

  update(_time: number, delta: number): void {
    if (!this.fight || this.finished) return;
    // Long frames (a background tab) are split so no timing window is skipped.
    for (let left = Math.min(delta, 250); left > 0; left -= 20) {
      withRng(this.state, (rng) => tickFight(this.fight, Math.min(20, left), rng));
    }
    this.slash = Math.max(0, this.slash - delta);
    this.block = Math.max(0, this.block - delta);
    for (const e of this.fight.events.splice(0)) this.show(e);
    this.render();
  }

  /** Poses both fighters from the fight's phases and timers. */
  private render(): void {
    const f = this.fight;
    const h = f.hero;
    let heroX = HERO_X;
    if (this.finished && f.heroHp <= 0) {
      this.pose(this.hero, 'fall', 3);
    } else if (h.phase === 'swing') {
      const t = 1 - h.timer / SWING_MS;
      if (t < WINDUP_SHARE) {
        const sub = t / WINDUP_SHARE;
        this.pose(this.hero, 'windup', sub < 0.5 ? 0 : 1);
      } else {
        const sub = (t - WINDUP_SHARE) / (1 - WINDUP_SHARE);
        this.pose(this.hero, 'strike', sub < 0.5 ? 0 : 1);
      }
    } else if (h.phase === 'parry') {
      const t = 1 - h.timer / f.parryMs;
      this.pose(this.hero, 'parry', t < 0.5 ? 0 : 1);
      heroX += 6;
    } else if (h.phase === 'recover') {
      this.pose(this.hero, 'idle', 0);
    } else if (h.phase === 'hit') {
      const t = 1 - h.timer / HIT_STUN_MS;
      this.pose(this.hero, 'hit', t < 0.5 ? 0 : 1);
      heroX -= 10;
    } else {
      const frame = Math.floor((this.time.now / 500) % 2);
      this.pose(this.hero, 'idle', frame);
    }
    this.hero.body.setX(heroX);

    const g = f.guard;
    let x = GUARD_X;
    let alpha = 1;
    switch (g.phase) {
      case 'enter': {
        const t = 1 - g.timer / ENTER_MS;
        x = Phaser.Math.Linear(ENTER_FROM_X, GUARD_X, t);
        const stepFrame = Math.floor(t * 8) % 4;
        this.pose(this.guard, 'step', stepFrame);
        break;
      }
      case 'windup': {
        const t = 1 - g.timer / windupMs(f.level);
        this.pose(this.guard, 'windup', t < 0.5 ? 0 : 1);
        break;
      }
      case 'stagger': {
        x += 18 * (g.timer / STAGGER_MS);
        const t = 1 - g.timer / STAGGER_MS;
        this.pose(this.guard, 'hit', t < 0.5 ? 0 : 1);
        break;
      }
      case 'down': {
        const t = 1 - g.timer / ENTER_MS;
        alpha = Math.max(0, g.timer / ENTER_MS);
        const fallFrame = Math.min(3, Math.floor(t * 4));
        this.pose(this.guard, 'fall', fallFrame);
        break;
      }
      default:
        if (this.slash > 0) {
          const t = 1 - this.slash / SLASH_MS;
          this.pose(this.guard, 'strike', t < 0.5 ? 0 : 1);
        } else if (this.block > 0) {
          const t = 1 - this.block / BLOCK_MS;
          this.pose(this.guard, 'parry', t < 0.5 ? 0 : 1);
        } else {
          const frame = Math.floor((this.time.now / 500) % 2);
          this.pose(this.guard, 'idle', frame);
        }
    }
    this.guard.body.setPosition(x, FLOOR_Y).setAlpha(alpha);
    this.warning.setVisible(g.phase === 'windup').setX(x);

    this.placeText?.setText({ gate: 'The Gate', court: 'The Court', castle: 'The Castle' }[rescueStage(f.guardIndex)]);
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
    const heroTip = this.getTip(this.hero);
    const guardTip = this.getTip(this.guard);
    const clashX = (heroTip.x + guardTip.x) / 2;
    const clashY = (heroTip.y + guardTip.y) / 2;
    switch (e.type) {
      case 'hit':
        sfx(this, 'sword_hit');
        this.spark(guardTip.x, guardTip.y, 0xff5040);
        this.say(e.down ? 'He falls!' : 'A telling blow!');
        break;
      case 'blocked':
        sfx(this, 'sword_clash', { volume: 0.5 });
        this.block = BLOCK_MS;
        this.spark(clashX, clashY);
        this.say('Blocked! Wait for an opening.');
        break;
      case 'parried':
        sfx(this, 'sword_clash');
        this.spark(clashX, clashY);
        this.say('Parried! Strike now!');
        break;
      case 'wounded':
        sfx(this, 'sword_hit', { rate: 0.8 });
        this.slash = SLASH_MS;
        this.cameras.main.shake(180, 0.01);
        this.cameras.main.flash(150, 160, 20, 20);
        this.say('You are wounded!');
        break;
      case 'nextGuard':
        sfx(this, 'drum', { volume: 0.4 });
        if (this.mission.mission === 'rescue' && rescueStage(this.fight.guardIndex) !== this.setting) {
          const next = rescueStage(this.fight.guardIndex);
          this.moveTo(next);
          this.say(next === 'court' ? 'The gate is forced. Into the court!' : 'The court is yours. Up the stairs to the castle keep!');
          break;
        }
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
    if (won) sfx(this, 'horn');
    const rescue = this.mission.mission === 'rescue';
    const lady = this.state.kidnap?.lady;
    this.add
      .text(WIDTH / 2, 150, won ? 'Victory!' : 'Defeat', textStyle(34, '#ffe9a0', { stroke: '#000', strokeThickness: 6 }))
      .setOrigin(0.5);
    if (won) this.say(rescue ? `The way is clear: ${lady} is free!` : 'The way to the treasury is clear!');
    else this.say(rescue ? 'You are beaten back from the keep.' : 'You are beaten back and flee the castle.');
    this.time.delayedCall(600, () => {
      new Button(this, WIDTH / 2, 364, 'Return to Map', () =>
        this.scene.start(SceneKeys.Map, this.mission.mission === 'raid'
          ? { raid: { target: this.mission.target, won } }
          : { rescue: { won } }),
      { keys: ['ENTER', 'SPACE'] });
    });
  }
}
