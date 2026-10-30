import Phaser from 'phaser';
import { HEIGHT, SceneKeys, WIDTH } from '../config';
import { session } from '../game/session';
import type { Stake } from '../model/actions';
import {
  lanceSway,
  MAX_PASSES,
  opponentStrike,
  recordPass,
  scoreStrike,
  startJoust,
  type Joust,
  type Strike,
} from '../model/joust';
import { playerLord } from '../model/state';
import { withRng } from '../model/turn';
import type { GameState, Lord, LordId } from '../model/types';
import { Button } from '../ui/Button';
import { addBackdrop, addTinted } from '../ui/assets';
import { lordColor, textStyle } from '../ui/theme';
import { playMusic, sfx, sfxLoop } from '../ui/audio';

const HORIZON = 180;
const VANISH = { x: 322, y: HORIZON };
/** Where the opponent's shield is at the moment of impact. */
const IMPACT = { x: 240, y: 225 };
const START_SCALE = 0.06;
const IMPACT_SCALE = 1.3;
/** Centre of the shield in the joust_knight sprite. */
const KNIGHT_SHIELD = { x: 86, y: 62 };
/** The lance sprite's butt end and point, in its own pixels. */
const LANCE_BUTT = { x: 37, y: 356 };
const LANCE_POINT_Y = 2;
/** Shield radius in local (scale 1) coordinates. */
const SHIELD_RADIUS = 30;
const CHARGE_MS = 2600;
const LANCE_BASE = { x: 600, y: 430 };
const AIM_KEY_SPEED = 0.25; // pixels per ms

const PLAYER_LINES: Record<Strike, string> = {
  unhorse: 'Your lance strikes true!',
  glance: 'Your lance glances off his shield.',
  miss: 'Your lance misses!',
};
const OPPONENT_LINES: Record<Strike, string> = {
  unhorse: 'His lance hurls you from the saddle!',
  glance: 'His lance glances off your shield.',
  miss: 'His lance misses you.',
};

type Phase = 'ready' | 'charging' | 'result' | 'over';

/** First-person tilt: aim the lance at the oncoming shield. */
export class JoustScene extends Phaser.Scene {
  private state!: GameState;
  private player!: Lord;
  private opponent!: Lord;
  private stake: Stake = 'fame';
  private joust!: Joust;
  private phase: Phase = 'ready';
  private elapsed = 0;
  private aim = { x: IMPACT.x, y: IMPACT.y };
  private tip = { x: IMPACT.x, y: IMPACT.y };
  private sway = 0;
  private lastPass: { mine: Strike; his: Strike } | null = null;

  private knight!: Phaser.GameObjects.Container;
  private lance!: Phaser.GameObjects.Image;
  private statusText!: Phaser.GameObjects.Text;
  private messageText!: Phaser.GameObjects.Text;
  private keys?: Phaser.Types.Input.Keyboard.CursorKeys;
  private hooves?: Phaser.Sound.BaseSound;

  constructor() {
    super(SceneKeys.Joust);
  }

  create(data: { opponent: LordId; stake: Stake }): void {
    if (!session.state) {
      this.scene.start(SceneKeys.Title);
      return;
    }
    this.state = session.state;
    this.player = playerLord(this.state);
    this.opponent = this.state.lords[data.opponent];
    this.stake = data.stake;
    this.joust = startJoust();
    this.sway = lanceSway(this.player.stats.jousting);
    this.phase = 'ready';
    this.lastPass = null;

    playMusic(this, 'tournament');
    this.events.once('shutdown', () => this.hooves?.destroy());
    this.drawLists();
    this.knight = this.drawKnight(lordColor(this.opponent.id));
    this.lance = this.add.image(LANCE_BASE.x, LANCE_BASE.y, 'lance');
    this.lance.setOrigin(LANCE_BUTT.x / this.lance.width, LANCE_BUTT.y / this.lance.height);
    this.drawUi();
    this.resetPass();

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      this.aim = { x: p.x, y: p.y };
    });
    this.input.on('pointerdown', () => this.ride());
    this.keys = this.input.keyboard?.createCursorKeys();
    this.input.keyboard?.on('keydown-SPACE', () => this.ride());
  }

  private drawLists(): void {
    addBackdrop(this, 'joust');
    // The tilt barrier runs from the vanishing point down beside the rider's horse.
    this.add.polygon(0, 0, [VANISH.x - 1, VANISH.y, VANISH.x + 2, VANISH.y, 274, HEIGHT, 246, HEIGHT], 0xc8a060)
      .setOrigin(0)
      .setStrokeStyle(1, 0x5a3a1a);
  }

  /** The opponent seen head-on, in his colours; the container's origin is the centre of his shield. */
  private drawKnight(color: number): Phaser.GameObjects.Container {
    return addTinted(this, VANISH.x, VANISH.y, 'joust_knight', color, KNIGHT_SHIELD);
  }

  private drawUi(): void {
    const style = textStyle(13, '#ffffff', { stroke: '#000', strokeThickness: 3 });
    this.add
      .text(WIDTH / 2, 6, `Tournament: ${this.player.name} against ${this.opponent.name}`, style)
      .setOrigin(0.5, 0);
    this.add
      .text(WIDTH / 2, 24, this.stake === 'land' ? 'Jousting for land' : 'Jousting for fame', style)
      .setOrigin(0.5, 0);
    this.statusText = this.add.text(WIDTH / 2, 42, '', style).setOrigin(0.5, 0);
    this.messageText = this.add
      .text(WIDTH / 2, 300, '', textStyle(16, '#ffffff', { stroke: '#000', strokeThickness: 4, align: 'center' }))
      .setOrigin(0.5, 0);
  }

  /** `pass`: the pass to show, the one about to be ridden by default. */
  private updateStatus(pass = this.joust.pass + 1): void {
    const j = this.joust;
    this.statusText.setText(
      `Pass ${Math.min(pass, MAX_PASSES)} of ${MAX_PASSES}   ·   Points: you ${j.playerPoints}, him ${j.opponentPoints}`,
    );
  }

  private resetPass(): void {
    this.elapsed = 0;
    this.knight.setPosition(VANISH.x, VANISH.y).setScale(START_SCALE).setAngle(0).setAlpha(1);
    this.updateStatus();
    this.messageText.setText('Aim at the centre of his shield: move the mouse, drag, or use the arrow keys.\nClick, tap or press Space to ride!');
  }

  private ride(): void {
    if (this.phase === 'ready') {
      this.phase = 'charging';
      this.messageText.setText('');
      this.hooves = sfxLoop(this, 'gallop', 0.6);
    } else if (this.phase === 'result' && !this.joust.over) {
      this.phase = 'ready';
      this.resetPass();
    }
  }

  update(_time: number, delta: number): void {
    if (this.phase === 'over' || !this.lance) return;
    this.steerAim(delta);
    if (this.phase === 'charging') this.elapsed += delta;

    const z = Math.min(1, this.elapsed / CHARGE_MS);
    const scale = START_SCALE + (IMPACT_SCALE - START_SCALE) * Math.pow(z, 2.2);
    const f = (scale - START_SCALE) / (IMPACT_SCALE - START_SCALE);
    if (this.phase !== 'result') {
      const gallop = Math.sin(this.elapsed * 0.018) * 6 * scale;
      this.knight
        .setScale(scale)
        .setPosition(VANISH.x + (IMPACT.x - VANISH.x) * f, VANISH.y + (IMPACT.y - VANISH.y) * f + gallop);
    }

    // The lance follows the aim with some lag, and sways with the gallop.
    const follow = 1 - Math.pow(0.88, delta / 16.67);
    this.tip.x += (this.aim.x - this.tip.x) * follow;
    this.tip.y += (this.aim.y - this.tip.y) * follow;
    const t = this.elapsed + this.time.now;
    const swayX = Math.sin(t * 0.011) * this.sway;
    const swayY = Math.cos(t * 0.017) * this.sway * 0.7 + Math.sin(t * 0.02) * 4;
    this.drawLance(this.tip.x + swayX, this.tip.y + swayY);

    if (this.phase === 'charging' && z >= 1) this.impact(this.tip.x + swayX, this.tip.y + swayY);
  }

  private steerAim(delta: number): void {
    if (!this.keys) return;
    const step = AIM_KEY_SPEED * delta;
    if (this.keys.left.isDown) this.aim.x -= step;
    if (this.keys.right.isDown) this.aim.x += step;
    if (this.keys.up.isDown) this.aim.y -= step;
    if (this.keys.down.isDown) this.aim.y += step;
    this.aim.x = Phaser.Math.Clamp(this.aim.x, 0, WIDTH);
    this.aim.y = Phaser.Math.Clamp(this.aim.y, HORIZON - 40, HEIGHT);
  }

  /** The lance from the bottom right to the tip, foreshortened to reach it. */
  private drawLance(x: number, y: number): void {
    const angle = Math.atan2(y - LANCE_BASE.y, x - LANCE_BASE.x) + Math.PI / 2;
    const length = Math.hypot(x - LANCE_BASE.x, y - LANCE_BASE.y);
    this.lance.setRotation(angle).setScale(0.8, length / (LANCE_BUTT.y - LANCE_POINT_Y));
  }

  private impact(tipX: number, tipY: number): void {
    this.phase = 'result';
    const shieldX = this.knight.x;
    const shieldY = this.knight.y;
    const distance = Math.hypot(tipX - shieldX, tipY - shieldY);
    const mine = scoreStrike(distance, SHIELD_RADIUS * IMPACT_SCALE);
    const his = withRng(this.state, (rng) => opponentStrike(this.opponent.stats.jousting, rng));
    recordPass(this.joust, mine, his);
    this.lastPass = { mine, his };
    this.updateStatus(this.joust.pass);
    this.hooves?.destroy();
    if (mine !== 'miss' || his !== 'miss') sfx(this, 'lance_hit', { volume: mine === 'unhorse' || his === 'unhorse' ? 1 : 0.6 });

    this.cameras.main.shake(his === 'unhorse' ? 400 : 150, his === 'unhorse' ? 0.02 : 0.006);
    if (his === 'unhorse') this.cameras.main.flash(250, 160, 30, 30);
    if (mine === 'unhorse') {
      this.tweens.add({ targets: this.knight, angle: -75, y: this.knight.y + 80, alpha: 0, duration: 700 });
    } else {
      // He thunders past.
      this.tweens.add({ targets: this.knight, x: this.knight.x - 260, scale: IMPACT_SCALE * 1.4, alpha: 0, duration: 450 });
    }

    const lines =
      mine === 'unhorse' && his === 'unhorse'
        ? ['Both lances strike true and both riders fall!', 'You remount for another pass.']
        : [PLAYER_LINES[mine], OPPONENT_LINES[his]];
    if (!this.joust.over) lines.push('Click, tap or press Space for the next pass.');
    this.messageText.setText(lines.join('\n'));
    if (this.joust.over) this.time.delayedCall(1200, () => this.finish());
  }

  private finish(): void {
    this.phase = 'over';
    const j = this.joust;
    let verdict: string;
    if (j.won) verdict = this.lastPass?.mine === 'unhorse' ? 'You unhorse him! You are the champion.' : 'You win on points!';
    else if (this.lastPass?.his === 'unhorse') verdict = 'You are thrown from the saddle.';
    else if (j.playerPoints === j.opponentPoints) verdict = 'A tie on points: the judges favour the defender.';
    else verdict = 'He wins on points.';
    this.add
      .text(WIDTH / 2, 90, j.won ? 'Victory!' : 'Defeat', textStyle(34, '#ffe9a0', { stroke: '#000', strokeThickness: 6 }))
      .setOrigin(0.5);
    this.messageText.setText(verdict);
    sfx(this, j.won ? 'cheer' : 'groan');
    new Button(this, WIDTH / 2, 362, 'Return to Map', () =>
      this.scene.start(SceneKeys.Map, {
        tournament: { opponent: this.opponent.id, stake: this.stake, won: j.won },
      }),
    { keys: ['ENTER', 'SPACE'] });
  }
}
