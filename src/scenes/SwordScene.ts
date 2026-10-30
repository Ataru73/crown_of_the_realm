import Phaser from 'phaser';
import { SceneKeys, WIDTH } from '../config';
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
import { addBackdrop, addTinted, setTintedFrame } from '../ui/assets';
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
/** The frames of each swordsman (`<key>_<frame>`). */
type Frame = 'idle' | 'windup' | 'strike' | 'parry' | 'hit' | 'down';
interface Anchor {
  /** The point on the floor under his hips. */
  feet: { x: number; y: number };
  /** His sword hand. */
  hand: { x: number; y: number };
}
/** Where each frame stands and holds the sword, in the frame's own pixels. */
const FRAMES: Record<Fighter, Record<Frame, Anchor>> = {
  swordsman_hero: {
    idle: { feet: { x: 37, y: 150 }, hand: { x: 85, y: 47 } },
    windup: { feet: { x: 42, y: 161 }, hand: { x: 27, y: 6 } },
    strike: { feet: { x: 60, y: 138 }, hand: { x: 128, y: 32 } },
    parry: { feet: { x: 31, y: 143 }, hand: { x: 45, y: 15 } },
    hit: { feet: { x: 41, y: 133 }, hand: { x: 6, y: 36 } },
    down: { feet: { x: 67, y: 36 }, hand: { x: 82, y: 31 } },
  },
  swordsman_guard: {
    idle: { feet: { x: 37, y: 150 }, hand: { x: 85, y: 48 } },
    windup: { feet: { x: 42, y: 160 }, hand: { x: 27, y: 5 } },
    strike: { feet: { x: 59, y: 138 }, hand: { x: 126, y: 33 } },
    parry: { feet: { x: 32, y: 143 }, hand: { x: 45, y: 17 } },
    hit: { feet: { x: 40, y: 131 }, hand: { x: 4, y: 37 } },
    down: { feet: { x: 66, y: 35 }, hand: { x: 76, y: 30 } },
  },
};
/** The grip in the sword sprite, as a fraction of its height. */
const SWORD_GRIP = 0.86;

/** Sword angles in degrees: 0 points straight up, positive leans toward the foe. */
const POSE = { idle: 35, raised: -75, struck: 115, parry: 5, flung: -50, dropped: 90 };
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
  sword: Phaser.GameObjects.Container;
  frame?: Frame;
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

    this.drawCorridor();
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

  private drawCorridor(): void {
    addBackdrop(this, 'corridor');
    // The painted torches flicker.
    for (const [x, y] of TORCHES) {
      const glow = this.add.ellipse(x, y, 40, 52, 0xffa830, 0.22).setBlendMode(Phaser.BlendModes.ADD);
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

  /**
   * A swordsman facing right (`facing` 1) or left (-1), his tunic in `color`;
   * the body's origin is on the floor under him, the sword's origin is his sword hand.
   */
  private drawFighter(key: Fighter, color: number, facing: 1 | -1): Swordsman {
    const figure = addTinted(this, 0, 0, `${key}_idle`, color);
    const blade = this.add.image(0, 0, 'sword').setOrigin(0.5, SWORD_GRIP);
    const sword = this.add.container(0, 0, [blade]);
    const body = this.add.container(ENTER_FROM_X, FLOOR_Y, [figure, sword]).setScale(facing, 1);
    const fighter = { key, body, figure, sword };
    this.pose(fighter, 'idle', POSE.idle);
    return fighter;
  }

  /** Shows `frame` with the sword in his hand at `angle`. */
  private pose(f: Swordsman, frame: Frame, angle: number): void {
    const a = FRAMES[f.key][frame];
    if (f.frame !== frame) {
      setTintedFrame(f.figure, `${f.key}_${frame}`, a.feet);
      f.sword.setPosition(a.hand.x - a.feet.x, a.hand.y - a.feet.y);
      f.frame = frame;
    }
    f.sword.setAngle(angle);
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
    if (this.finished && f.heroHp <= 0) this.pose(this.hero, 'down', POSE.dropped);
    else if (h.phase === 'swing') {
      const t = 1 - h.timer / SWING_MS;
      this.pose(this.hero, t < WINDUP_SHARE ? 'windup' : 'strike', Phaser.Math.Linear(POSE.raised, POSE.struck, t));
    } else if (h.phase === 'parry') {
      this.pose(this.hero, 'parry', POSE.parry);
      heroX += 6;
    } else if (h.phase === 'recover') this.pose(this.hero, 'idle', POSE.struck - 30);
    else if (h.phase === 'hit') {
      this.pose(this.hero, 'hit', POSE.flung);
      heroX -= 10;
    } else this.pose(this.hero, 'idle', POSE.idle);
    this.hero.body.setX(heroX);

    const g = f.guard;
    let x = GUARD_X;
    let alpha = 1;
    // The guard faces left, so his angles are mirrored by the container's scale.
    switch (g.phase) {
      case 'enter':
        x = Phaser.Math.Linear(ENTER_FROM_X, GUARD_X, 1 - g.timer / ENTER_MS);
        this.pose(this.guard, 'idle', POSE.idle);
        break;
      case 'windup':
        this.pose(this.guard, 'windup',
          Phaser.Math.Linear(POSE.idle, POSE.raised, Math.min(1, 1.6 * (1 - g.timer / windupMs(f.level)))));
        break;
      case 'stagger':
        x += 18 * (g.timer / STAGGER_MS);
        this.pose(this.guard, 'hit', POSE.flung);
        break;
      case 'down':
        alpha = Math.max(0, g.timer / ENTER_MS);
        this.pose(this.guard, 'down', POSE.dropped);
        break;
      default:
        if (this.slash > 0) this.pose(this.guard, 'strike', POSE.struck);
        else if (this.block > 0) this.pose(this.guard, 'parry', POSE.parry);
        else this.pose(this.guard, 'idle', POSE.idle);
    }
    this.guard.body.setPosition(x, FLOOR_Y).setAlpha(alpha);
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
        sfx(this, 'sword_hit');
        this.spark(GUARD_X - 10, FLOOR_Y - 90, 0xff5040);
        this.say(e.down ? 'He falls!' : 'A telling blow!');
        break;
      case 'blocked':
        sfx(this, 'sword_clash', { volume: 0.5 });
        this.block = BLOCK_MS;
        this.spark(clashX, FLOOR_Y - 120);
        this.say('Blocked! Wait for an opening.');
        break;
      case 'parried':
        sfx(this, 'sword_clash');
        this.spark(clashX, FLOOR_Y - 130);
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
