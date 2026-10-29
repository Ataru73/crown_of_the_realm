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
import { lordColor, textStyle } from '../ui/theme';

const HORIZON = 150;
const VANISH = { x: 325, y: HORIZON };
/** Where the opponent's shield is at the moment of impact. */
const IMPACT = { x: 240, y: 205 };
const START_SCALE = 0.06;
const IMPACT_SCALE = 1.3;
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
  private lance!: Phaser.GameObjects.Graphics;
  private statusText!: Phaser.GameObjects.Text;
  private messageText!: Phaser.GameObjects.Text;
  private keys?: Phaser.Types.Input.Keyboard.CursorKeys;

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

    this.drawLists();
    this.knight = this.drawKnight(lordColor(this.opponent.id));
    this.lance = this.add.graphics();
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
    this.add.rectangle(0, 0, WIDTH, HORIZON, 0x8fb8de).setOrigin(0);
    // Stands full of spectators along the horizon.
    const stands = this.add.graphics();
    stands.fillStyle(0x6a4a30).fillRect(0, HORIZON - 30, WIDTH, 30);
    const crowd = [0xc04040, 0x4060c0, 0xe0c060, 0x40a060, 0xe0e0e0, 0x804090];
    for (let x = 4; x < WIDTH; x += 7) {
      stands.fillStyle(crowd[(x * 7) % crowd.length]).fillRect(x, HORIZON - 26 + ((x * 3) % 8), 4, 6);
    }
    for (let x = 30; x < WIDTH; x += 90) {
      stands.lineStyle(1, 0x333333).lineBetween(x, HORIZON - 30, x, HORIZON - 52);
      stands.fillStyle(crowd[(x / 30) % crowd.length]).fillTriangle(x, HORIZON - 52, x + 14, HORIZON - 47, x, HORIZON - 42);
    }
    this.add.rectangle(0, HORIZON, WIDTH, HEIGHT - HORIZON, 0x6a8a3a).setOrigin(0);
    // The tilt barrier runs from the vanishing point toward the player.
    this.add.polygon(0, 0, [VANISH.x, VANISH.y, VANISH.x + 3, VANISH.y, 300, HEIGHT, 250, HEIGHT], 0xd8c08a)
      .setOrigin(0)
      .setStrokeStyle(1, 0x6a4a2a);
  }

  /** The opponent seen head-on; the container's origin is the centre of his shield. */
  private drawKnight(color: number): Phaser.GameObjects.Container {
    const g = this.add.graphics();
    const rider = -34;
    // Horse and caparison.
    g.fillStyle(0x5a3a22).fillEllipse(rider, 100, 90, 80);
    g.fillStyle(0x4a2e1a).fillRect(rider - 13, 40, 26, 75);
    g.fillStyle(color).fillTriangle(rider - 62, 160, rider + 62, 160, rider, 55);
    g.fillStyle(0x2a1a10).fillRect(rider - 30, 150, 10, 40).fillRect(rider + 20, 150, 10, 40);
    // Rider.
    g.fillStyle(0x9a9aa2).fillRect(rider - 22, -50, 44, 72);
    g.fillStyle(0xb0b0b8).fillRect(rider - 15, -95, 30, 34);
    g.fillStyle(0x222222).fillRect(rider - 11, -82, 22, 4);
    g.fillStyle(color).fillTriangle(rider - 6, -95, rider + 6, -95, rider, -122);
    // His lance, foreshortened, pointing at the viewer.
    g.lineStyle(7, 0xb08850).lineBetween(rider - 26, -10, rider - 6, 26);
    g.fillStyle(0x777777).fillCircle(rider - 6, 26, 6);
    // Shield (a heater shield) with a chevron.
    g.fillStyle(color).fillPoints(
      [
        { x: -28, y: -30 }, { x: 28, y: -30 }, { x: 28, y: 6 }, { x: 0, y: 38 }, { x: -28, y: 6 },
      ].map((p) => new Phaser.Geom.Point(p.x, p.y)),
      true,
    );
    g.lineStyle(3, 0xffffff).strokePoints(
      [
        { x: -28, y: -30 }, { x: 28, y: -30 }, { x: 28, y: 6 }, { x: 0, y: 38 }, { x: -28, y: 6 },
      ].map((p) => new Phaser.Geom.Point(p.x, p.y)),
      true,
    );
    g.lineStyle(6, 0xffffff).lineBetween(-24, 8, 0, -10).lineBetween(0, -10, 24, 8);
    return this.add.container(VANISH.x, VANISH.y, [g]);
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
    this.messageText.setText('Aim at the centre of his shield with the mouse or arrow keys.\nClick or press Space to ride!');
  }

  private ride(): void {
    if (this.phase === 'ready') {
      this.phase = 'charging';
      this.messageText.setText('');
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

  /** A tapering wooden lance from the bottom right to the tip. */
  private drawLance(x: number, y: number): void {
    const angle = Math.atan2(y - LANCE_BASE.y, x - LANCE_BASE.x) + Math.PI / 2;
    const side = (w: number) => ({ x: Math.cos(angle) * w, y: Math.sin(angle) * w });
    const base = side(14);
    const point = side(2);
    this.lance.clear();
    this.lance
      .fillStyle(0xb08850)
      .fillPoints(
        [
          new Phaser.Geom.Point(LANCE_BASE.x - base.x, LANCE_BASE.y - base.y),
          new Phaser.Geom.Point(x - point.x, y - point.y),
          new Phaser.Geom.Point(x + point.x, y + point.y),
          new Phaser.Geom.Point(LANCE_BASE.x + base.x, LANCE_BASE.y + base.y),
        ],
        true,
      );
    this.lance.fillStyle(0x777777).fillCircle(x, y, 3);
    // Vamplate (hand guard) near the grip.
    const gx = LANCE_BASE.x + (x - LANCE_BASE.x) * 0.12;
    const gy = LANCE_BASE.y + (y - LANCE_BASE.y) * 0.12;
    this.lance.fillStyle(0x8a8a92).fillCircle(gx, gy, 22);
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
    if (!this.joust.over) lines.push('Click or press Space for the next pass.');
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
    new Button(this, WIDTH / 2, 362, 'Return to Map', () =>
      this.scene.start(SceneKeys.Map, {
        tournament: { opponent: this.opponent.id, stake: this.stake, won: j.won },
      }),
    );
  }
}
