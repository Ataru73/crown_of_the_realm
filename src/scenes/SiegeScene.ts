import Phaser from 'phaser';
import { HEIGHT, SceneKeys, WIDTH } from '../config';
import { session } from '../game/session';
import { territoryDef } from '../model/map';
import {
  ammoLeft,
  KEEP_HEIGHT,
  KEEP_OFFSET,
  endSiege,
  release,
  ROW_HEIGHT,
  ROW_HP,
  selectAmmo,
  setAngle,
  siegeResult,
  standingRows,
  startCharge,
  startSiege,
  tickSiege,
  WALL_THICKNESS,
  WIND_MAX,
  wallDamage,
  YARD_DEPTH,
  type Ammo,
  type Siege,
  type SiegeEvent,
} from '../model/siege';
import { playerLord } from '../model/state';
import { withRng } from '../model/turn';
import type { GameState, TerritoryId } from '../model/types';
import { Button } from '../ui/Button';
import { lordColor, textStyle } from '../ui/theme';

const GROUND_Y = 318;
const CATAPULT_X = 56;
/** Pixels per metre. */
const SCALE = 4;
/** Degrees per second while an angle key is held. */
const ANGLE_RATE = 30;
const AMMO_LABEL: Record<Ammo, string> = { stone: 'Stones', fire: 'Fire Pots' };

const sx = (x: number) => CATAPULT_X + x * SCALE;
const sy = (y: number) => GROUND_Y - y * SCALE;

/** Side view of the catapult and the castle wall; lob shots until the wall gives or the ammunition runs out. */
export class SiegeScene extends Phaser.Scene {
  private state!: GameState;
  private target!: TerritoryId;
  private siege!: Siege;
  private finished = false;

  private arm!: Phaser.GameObjects.Graphics;
  private wall!: Phaser.GameObjects.Graphics;
  private shot!: Phaser.GameObjects.Arc;
  private trail!: Phaser.GameObjects.Graphics;
  private lastTrail: { x: number; y: number }[] = [];
  private meter!: Phaser.GameObjects.Graphics;
  private hudText!: Phaser.GameObjects.Text;
  private aimText!: Phaser.GameObjects.Text;
  private windFlag!: Phaser.GameObjects.Graphics;
  private messageText!: Phaser.GameObjects.Text;
  private ammoButtons!: Record<Ammo, Button>;
  private controls: Button[] = [];
  private keys?: Record<'up' | 'down', Phaser.Input.Keyboard.Key>;
  private aimDelta = 0;

  constructor() {
    super(SceneKeys.Siege);
  }

  create(data: { target: TerritoryId }): void {
    if (!session.state) {
      this.scene.start(SceneKeys.Title);
      return;
    }
    this.state = session.state;
    this.target = data.target;
    const player = playerLord(this.state);
    this.siege = withRng(this.state, (rng) => startSiege(player.army.catapults, rng));
    this.finished = false;
    this.lastTrail = [];
    this.aimDelta = 0;

    this.drawScenery();
    this.wall = this.add.graphics();
    this.trail = this.add.graphics();
    this.drawCatapult();
    this.shot = this.add.circle(0, 0, 4, 0x6a6460).setVisible(false);
    this.drawUi();
    this.render();
  }

  private drawScenery(): void {
    const g = this.add.graphics();
    g.fillStyle(0x86a8c8).fillRect(0, 0, WIDTH, GROUND_Y);
    g.fillStyle(0x6d8a5a).fillEllipse(160, GROUND_Y + 10, 520, 120).fillEllipse(520, GROUND_Y + 14, 460, 90);
    g.fillStyle(0x5a7a3a).fillRect(0, GROUND_Y, WIDTH, HEIGHT - GROUND_Y);

    // The keep and huts in the bailey, behind the wall.
    const front = sx(this.siege.distance);
    const back = sx(this.siege.distance + WALL_THICKNESS);
    const keepX = sx(this.siege.distance + WALL_THICKNESS + KEEP_OFFSET);
    const keepW = (YARD_DEPTH - KEEP_OFFSET) * SCALE;
    g.fillStyle(0x7a746a).fillRect(keepX, sy(KEEP_HEIGHT), keepW, KEEP_HEIGHT * SCALE);
    for (let x = keepX; x < keepX + keepW; x += 14) g.fillRect(x, sy(KEEP_HEIGHT + 2), 8, 8);
    g.fillStyle(0x2a2420).fillRect(keepX + 14, sy(26), 8, 14).fillRect(keepX + 40, sy(26), 8, 14);
    const banner = lordColor(this.state.territories[this.target].owner);
    const poleX = keepX + keepW / 2;
    g.lineStyle(2, 0x3a2a1a).lineBetween(poleX, sy(KEEP_HEIGHT + 2), poleX, sy(KEEP_HEIGHT + 12));
    g.fillStyle(banner).fillRect(poleX + 1, sy(KEEP_HEIGHT + 12), 16, 10);
    g.fillStyle(0x8a6a3a);
    for (const m of [4, 10]) {
      const hx = sx(this.siege.distance + WALL_THICKNESS + m);
      g.fillRect(hx - 9, sy(4), 18, 4 * SCALE).fillTriangle(hx - 12, sy(4), hx + 12, sy(4), hx, sy(8));
    }
    // Rubble apron at the wall's foot.
    g.fillStyle(0x6a645a).fillRect(front - 4, GROUND_Y - 3, back - front + 8, 3);
  }

  private drawCatapult(): void {
    const g = this.add.graphics();
    g.fillStyle(0x5a3a1e).fillRect(CATAPULT_X - 26, GROUND_Y - 10, 44, 8);
    g.fillStyle(0x3a2a1a).fillCircle(CATAPULT_X - 18, GROUND_Y - 3, 5).fillCircle(CATAPULT_X + 10, GROUND_Y - 3, 5);
    g.fillStyle(0x6a4a2a).fillTriangle(CATAPULT_X - 14, GROUND_Y - 10, CATAPULT_X + 6, GROUND_Y - 10, CATAPULT_X - 4, sy(4));
    this.arm = this.add.graphics({ x: CATAPULT_X - 4, y: sy(4) });
  }

  private drawUi(): void {
    const def = territoryDef(this.target);
    const owner = this.state.territories[this.target].owner;
    const whose = owner ? `${this.state.lords[owner].name}'s castle` : 'the castle';
    const shadow = { stroke: '#000', strokeThickness: 3 };
    this.add.text(WIDTH / 2, 6, `The Siege of ${def.name}`, textStyle(20, '#f4e4bc', { stroke: '#000', strokeThickness: 4 })).setOrigin(0.5, 0);
    this.add.text(WIDTH / 2, 30, `Batter down the walls of ${whose} before the assault`, textStyle(11, '#f4e4bc', shadow)).setOrigin(0.5, 0);
    this.hudText = this.add.text(10, 50, '', textStyle(12, '#ffffff', { ...shadow, lineSpacing: 2 }));
    this.aimText = this.add.text(CATAPULT_X - 22, GROUND_Y - 70, '', textStyle(11, '#ffffff', shadow));
    this.messageText = this.add
      .text(WIDTH / 2, 66, 'Set the angle, hold to wind the arm and release to throw.', textStyle(13, '#ffe9a0', { ...shadow, align: 'center' }))
      .setOrigin(0.5, 0);

    // Wind pennant on a pole midfield.
    const poleX = WIDTH / 2 - 20;
    this.add.rectangle(poleX, 130, 2, 30, 0x3a2a1a).setOrigin(0.5, 0);
    this.windFlag = this.add.graphics({ x: poleX, y: 133 });
    this.add.text(poleX, 162, 'wind', textStyle(10, '#ffffff', shadow)).setOrigin(0.5, 0);

    this.meter = this.add.graphics();

    const opts = { width: 104, height: 26, fontSize: 13 };
    const y = 362;
    this.ammoButtons = {
      stone: new Button(this, 66, y, '', () => this.chooseAmmo('stone'), opts),
      fire: new Button(this, 176, y, '', () => this.chooseAmmo('fire'), opts),
    };
    const up = new Button(this, 262, y, '▲', () => this.nudge(5), { width: 34, height: 26, fontSize: 13 });
    const down = new Button(this, 300, y, '▼', () => this.nudge(-5), { width: 34, height: 26, fontSize: 13 });
    const throwButton = new Button(this, 392, y, 'Hold to Throw', () => this.charge(), { ...opts, width: 128, onPress: true });
    const storm = new Button(this, 548, y, 'Storm the Walls', () => this.storm(), { ...opts, width: 150 });
    this.controls = [this.ammoButtons.stone, this.ammoButtons.fire, up, down, throwButton, storm];
    // Released anywhere, not just over the button.
    this.input.on('pointerup', () => this.throw());
    this.add
      .text(WIDTH / 2, 390, 'Keys: Up/Down aim · hold Space to throw · 1 stones, 2 fire pots · Enter to storm', textStyle(10, '#dddddd', shadow))
      .setOrigin(0.5);

    const kb = this.input.keyboard;
    if (kb) {
      this.keys = { up: kb.addKey('UP'), down: kb.addKey('DOWN') };
      kb.on('keydown-SPACE', () => this.charge());
      kb.on('keyup-SPACE', () => this.throw());
      kb.on('keydown-ONE', () => this.chooseAmmo('stone'));
      kb.on('keydown-TWO', () => this.chooseAmmo('fire'));
      kb.on('keydown-ENTER', () => this.storm());
    }
  }

  private nudge(degrees: number): void {
    if (!this.finished) setAngle(this.siege, Math.round(this.siege.angle + degrees));
  }

  private chooseAmmo(ammo: Ammo): void {
    if (!this.finished) selectAmmo(this.siege, ammo);
  }

  private charge(): void {
    if (!this.finished) startCharge(this.siege);
  }

  private throw(): void {
    if (!this.finished && release(this.siege)) this.lastTrail = [];
  }

  private storm(): void {
    if (!this.finished) endSiege(this.siege);
  }

  update(_time: number, delta: number): void {
    if (!this.siege || this.finished) return;
    const s = this.siege;
    if (s.phase === 'aim' && this.keys) {
      const dir = (this.keys.up.isDown ? 1 : 0) - (this.keys.down.isDown ? 1 : 0);
      // Accumulate so slow frames still turn the arm smoothly by whole degrees.
      this.aimDelta += (dir * ANGLE_RATE * delta) / 1000;
      const whole = Math.trunc(this.aimDelta);
      if (whole !== 0) {
        setAngle(s, s.angle + whole);
        this.aimDelta -= whole;
      }
    }
    // Long frames (a background tab) are split so the shot never tunnels through the wall.
    for (let left = Math.min(delta, 250); left > 0; left -= 20) {
      withRng(this.state, (rng) => tickSiege(s, Math.min(20, left), rng));
      if (s.shot && s.phase === 'flight') this.lastTrail.push({ x: s.shot.x, y: s.shot.y });
    }
    for (const e of s.events.splice(0)) this.show(e);
    this.render();
  }

  private render(): void {
    const s = this.siege;
    this.drawWall();

    // Throwing arm: at the throw angle, wound back toward the ground behind while charging.
    const a = Phaser.Math.DegToRad(s.angle);
    const theta = s.phase === 'charge' ? a + s.power * (Phaser.Math.DegToRad(165) - a) : a;
    const len = 30;
    this.arm.clear().lineStyle(4, 0x7a5a3a).lineBetween(0, 0, Math.cos(theta) * len, -Math.sin(theta) * len);
    if (s.phase === 'aim' || s.phase === 'charge') {
      this.arm.fillStyle(s.ammo === 'fire' ? 0xff8a20 : 0x6a6460);
      this.arm.fillCircle(Math.cos(theta) * len, -Math.sin(theta) * len, 4);
      // Aim guide along the launch direction.
      this.arm.lineStyle(1, 0xffffff, 0.6);
      for (let d = 36; d < 76; d += 8) this.arm.lineBetween(Math.cos(a) * d, -Math.sin(a) * d, Math.cos(a) * (d + 4), -Math.sin(a) * (d + 4));
    }

    if (s.shot) {
      this.shot
        .setVisible(true)
        .setPosition(sx(s.shot.x), sy(s.shot.y))
        .setFillStyle(s.shot.ammo === 'fire' ? 0xff8a20 : 0x6a6460);
    } else this.shot.setVisible(false);

    this.trail.clear().fillStyle(0xffffff, 0.5);
    this.lastTrail.forEach((p, i) => {
      if (i % 3 === 0) this.trail.fillRect(sx(p.x) - 1, sy(p.y) - 1, 2, 2);
    });

    this.meter.clear();
    const mx = 14;
    const my = GROUND_Y - 100;
    this.meter.fillStyle(0x000000, 0.5).fillRect(mx, my, 12, 90);
    this.meter.fillStyle(0xe0c040).fillRect(mx + 2, my + 88 - 86 * s.power, 8, 86 * s.power);
    this.meter.lineStyle(1, 0xffffff).strokeRect(mx, my, 12, 90);

    // The pennant streams with the wind, longer the stronger it blows.
    const fly = Math.sign(s.wind || 1) * (4 + 18 * (Math.abs(s.wind) / WIND_MAX));
    this.windFlag.clear().fillStyle(0xd03030).fillTriangle(0, 0, 0, 10, fly, 5);

    this.aimText.setText(`Angle ${s.angle}°\nPower ${Math.round(s.power * 100)}%`);
    this.hudText.setText([
      `Wall knocked down: ${Math.round(wallDamage(s) * 100)}%`,
      `Fires in the bailey: ${s.fireHits}`,
      `Wind: ${s.wind === 0 ? 'calm' : `${s.wind > 0 ? 'toward the castle' : 'against you'} (${Math.abs(s.wind).toFixed(1)})`}`,
    ].join('\n'));
    // The controls are gone once the siege is over.
    if (this.finished) return;
    for (const ammo of ['stone', 'fire'] as Ammo[]) {
      const b = this.ammoButtons[ammo];
      const selected = s.ammo === ammo ? '▸ ' : '';
      b.setLabel(`${selected}${AMMO_LABEL[ammo]} ${ammoLeft(s, ammo)}`).setEnabled(s.phase === 'aim' && ammoLeft(s, ammo) > 0);
    }
  }

  /** Courses of stone, darker the more they are cracked; fallen ones are gone. */
  private drawWall(): void {
    const s = this.siege;
    const g = this.wall.clear();
    const left = sx(s.distance);
    const width = WALL_THICKNESS * SCALE;
    const standing = standingRows(s);
    for (let r = 0; r < standing; r++) {
      const health = s.rows[r] / ROW_HP[r];
      const shade = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(0x4a443c),
        Phaser.Display.Color.ValueToColor(0x9a9488),
        1,
        health,
      );
      const top = sy((r + 1) * ROW_HEIGHT);
      g.fillStyle(Phaser.Display.Color.GetColor(shade.r, shade.g, shade.b)).fillRect(left, top, width, ROW_HEIGHT * SCALE);
      g.lineStyle(1, 0x3a352e).strokeRect(left, top, width, ROW_HEIGHT * SCALE);
      if (health < 1) g.lineStyle(1, 0x1a1814).lineBetween(left + 3, top + 4, left + width - 5, top + ROW_HEIGHT * SCALE - 3);
    }
    if (standing > 0) {
      const top = sy(standing * ROW_HEIGHT);
      g.fillStyle(0x8a8478);
      for (let x = left; x < left + width; x += 8) g.fillRect(x, top - 6, 5, 6);
    }
    // Rubble from the fallen courses.
    const fallen = ROW_HP.length - standing;
    if (fallen > 0) {
      g.fillStyle(0x6a645a).fillTriangle(left - 8 - fallen * 3, GROUND_Y, left + width + 8, GROUND_Y, left + width / 2, GROUND_Y - 4 - fallen * 3);
    }
  }

  private puff(x: number, y: number, color: number, count = 6, size = 6): void {
    for (let i = 0; i < count; i++) {
      const p = this.add.circle(sx(x), sy(y), size, color, 0.8);
      this.tweens.add({
        targets: p,
        x: p.x + Phaser.Math.Between(-18, 18),
        y: p.y - Phaser.Math.Between(4, 24),
        alpha: 0,
        scale: 1.8,
        duration: 600,
        onComplete: () => p.destroy(),
      });
    }
  }

  private flames(x: number): void {
    for (let i = 0; i < 3; i++) {
      const f = this.add.ellipse(sx(x) + (i - 1) * 10, GROUND_Y - 8, 12, 20, 0xffa830);
      this.tweens.add({ targets: f, scaleY: 1.6, alpha: 0, y: f.y - 18, duration: 900, delay: i * 120, onComplete: () => f.destroy() });
    }
  }

  private say(text: string): void {
    this.messageText.setText(text);
  }

  private show(e: SiegeEvent): void {
    const s = this.siege;
    const at = s.shot ?? { x: 0, y: 0 };
    switch (e.type) {
      case 'launch':
        this.say(e.ammo === 'fire' ? 'A fire pot arcs toward the castle...' : 'The stone flies...');
        break;
      case 'wall':
        if (e.ammo === 'fire') {
          this.flames(at.x);
          this.say('The fire pot bursts on the stones, harmlessly. Throw it over the wall!');
        } else if (e.collapsed) {
          this.cameras.main.shake(400, 0.012);
          this.puff(at.x, at.y, 0x9a9488, 14, 9);
          this.say(standingRows(s) === 0 ? 'The wall comes crashing down: a clear breach!' : 'A section of the wall collapses!');
        } else {
          this.cameras.main.shake(150, 0.005);
          this.puff(at.x, at.y, 0xb0a898);
          this.say(e.row === 0 ? 'A hit at the footing! It shudders.' : 'A hit! Stones crack and tumble.');
        }
        break;
      case 'short':
        this.puff(at.x, 0, 0x8a7a5a);
        this.say('Short! Throw harder or higher.');
        break;
      case 'yard':
        if (e.ammo === 'fire') {
          this.flames(at.x);
          this.say('The bailey is ablaze! Defenders burn.');
        } else {
          this.puff(at.x, 0, 0x8a7a5a);
          this.say('Over the wall: the stone does little in the bailey.');
        }
        break;
      case 'long':
        this.say('Long! The shot sails over the castle.');
        break;
      case 'over':
        this.finish();
        break;
    }
  }

  private finish(): void {
    this.finished = true;
    this.controls.forEach((b) => b.destroy());
    const result = siegeResult(this.siege);
    const pct = Math.round(result.wallDamage * 100);
    this.add
      .text(WIDTH / 2, 110, 'To the Assault!', textStyle(30, '#ffe9a0', { stroke: '#000', strokeThickness: 6 }))
      .setOrigin(0.5);
    const fires = result.fireHits ? ` and set ${result.fireHits} fire${result.fireHits === 1 ? '' : 's'} in the bailey` : '';
    this.say(`You knocked down ${pct}% of the wall${fires}.`);
    this.time.delayedCall(500, () => {
      new Button(this, WIDTH / 2, 362, 'Storm the Castle', () =>
        this.scene.start(SceneKeys.Battle, { target: this.target, siege: result }),
      );
    });
  }
}
