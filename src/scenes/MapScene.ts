import Phaser from 'phaser';
import { HEIGHT, SceneKeys, WIDTH } from '../config';
import { session } from '../game/session';
import { attackableTerritories, type Action } from '../model/actions';
import { playAiTurn } from '../model/ai';
import { income, upkeep } from '../model/economy';
import { territoryDef } from '../model/map';
import { currentLord } from '../model/state';
import { dateLabel, playTurn } from '../model/turn';
import { RuleError, type Army, type GameState, type TerritoryId } from '../model/types';
import { Button } from '../ui/Button';
import { openBuyDialog } from '../ui/BuyDialog';
import { showDialog } from '../ui/Dialog';
import { MapView } from '../ui/MapView';
import { COLORS, textStyle } from '../ui/theme';

const PANEL_X = 462;
const PANEL_CENTER = PANEL_X + (WIDTH - PANEL_X) / 2;
const AI_TURN_DELAY_MS = 350;

function losses(before: Army, after: Army): string {
  const s = before.soldiers - after.soldiers;
  const k = before.knights - after.knights;
  return `Losses: ${s} soldier${s === 1 ? '' : 's'}, ${k} knight${k === 1 ? '' : 's'}.`;
}

/** The campaign map: the player's turn happens here, then the AI lords move. */
export class MapScene extends Phaser.Scene {
  private state!: GameState;
  private map!: MapView;
  private selected: TerritoryId | null = null;
  private busy = false;

  private dateText!: Phaser.GameObjects.Text;
  private lordText!: Phaser.GameObjects.Text;
  private infoText!: Phaser.GameObjects.Text;
  private logText!: Phaser.GameObjects.Text;
  private buttons!: Record<'buy' | 'attack' | 'raid' | 'joustFame' | 'joustLand' | 'pass', Button>;

  constructor() {
    super(SceneKeys.Map);
  }

  create(): void {
    if (!session.state) {
      this.scene.start(SceneKeys.Title);
      return;
    }
    this.state = session.state;
    this.selected = null;
    this.busy = false;

    this.add.rectangle(0, 0, WIDTH, HEIGHT, COLORS.sea).setOrigin(0);
    this.map = new MapView(this, (id) => this.select(id));
    this.buildPanel();
    this.logText = this.add.text(8, 352, '', textStyle(10, '#f4e4bc', { lineSpacing: 1 }));

    this.refresh();
    if (this.state.status !== 'playing') this.endGame();
    else if (!currentLord(this.state).isPlayer) void this.runAiTurns();
  }

  private buildPanel(): void {
    this.add.rectangle(PANEL_X, 0, WIDTH - PANEL_X, HEIGHT, COLORS.parchment).setOrigin(0);
    this.add.rectangle(PANEL_X, 0, 3, HEIGHT, COLORS.border).setOrigin(0);
    this.dateText = this.add.text(PANEL_CENTER, 8, '', textStyle(15)).setOrigin(0.5, 0);
    this.lordText = this.add.text(PANEL_X + 10, 30, '', textStyle(11, '#3a2210', { lineSpacing: 2 }));
    this.infoText = this.add.text(PANEL_X + 10, 130, '', textStyle(11, '#3a2210', {
      lineSpacing: 2,
      wordWrap: { width: WIDTH - PANEL_X - 18 },
    }));

    const opts = { width: 156, height: 24, fontSize: 13 };
    const at = (i: number) => 228 + i * 28;
    this.buttons = {
      buy: new Button(this, PANEL_CENTER, at(0), 'Muster Army', () => this.openBuy(), opts),
      attack: new Button(this, PANEL_CENTER, at(1), 'Attack', () => this.attack(), opts),
      raid: new Button(this, PANEL_CENTER, at(2), 'Raid Castle', () => this.raid(), opts),
      joustFame: new Button(this, PANEL_CENTER, at(3), 'Joust for Fame', () => this.joust('fame'), opts),
      joustLand: new Button(this, PANEL_CENTER, at(4), 'Joust for Land', () => this.joust('land'), opts),
      pass: new Button(this, PANEL_CENTER, at(5), 'Rest (End Turn)', () => this.act({ type: 'pass' }), opts),
    };
  }

  private get player() {
    return Object.values(this.state.lords).find((l) => l.isPlayer)!;
  }

  private isPlayerTurn(): boolean {
    return !this.busy && this.state.status === 'playing' && currentLord(this.state).isPlayer;
  }

  /** Owner of the selected territory, if it is another living lord. */
  private selectedRival() {
    const owner = this.selected ? this.state.territories[this.selected].owner : null;
    const lord = owner ? this.state.lords[owner] : null;
    return lord && !lord.isPlayer && lord.alive ? lord : null;
  }

  private select(id: TerritoryId): void {
    this.selected = this.selected === id ? null : id;
    this.refresh();
  }

  private refresh(): void {
    const s = this.state;
    const p = this.player;
    const attackable = new Set(this.isPlayerTurn() ? attackableTerritories(s, p.id) : []);
    this.map.refresh(s, this.selected, attackable);

    this.dateText.setText(dateLabel(s));
    const net = income(s, p.id) - upkeep(p.army);
    this.lordText.setText([
      p.name,
      `Gold ${p.gold}  (${net >= 0 ? '+' : ''}${net}/month)`,
      `Fame ${p.fame}`,
      `Army: ${p.army.soldiers} soldiers, ${p.army.knights} knights,`,
      `      ${p.army.catapults} catapults`,
      `Camped at ${territoryDef(p.armyAt).name}`,
    ].join('\n'));

    this.infoText.setText(this.selectionInfo());
    const turn = this.isPlayerTurn();
    const rival = this.selectedRival();
    const name = this.selected ? territoryDef(this.selected).name : '';
    this.buttons.buy.setEnabled(turn);
    this.buttons.attack
      .setLabel(this.selected && attackable.has(this.selected) ? `Attack ${name}` : 'Attack')
      .setEnabled(turn && !!this.selected && attackable.has(this.selected));
    this.buttons.raid.setEnabled(turn && !!rival);
    this.buttons.joustFame.setEnabled(turn && !!rival);
    this.buttons.joustLand.setEnabled(turn && !!rival);
    this.buttons.pass.setEnabled(turn);

    this.logText.setText(s.log.slice(-3).join('\n'));
  }

  private selectionInfo(): string {
    if (this.state.status !== 'playing') return 'The war is over.';
    if (this.busy) return `${currentLord(this.state).name} is moving...`;
    if (!this.selected) return 'Click a territory.\nRed rings: lands your army can attack.';
    const t = this.state.territories[this.selected];
    const def = territoryDef(t.id);
    const owner = t.owner ? this.state.lords[t.owner] : null;
    const lines = [
      `${def.name}${t.castle ? ' (castle)' : ''}`,
      `Held by ${owner ? owner.name : 'no lord'}`,
      `Income ${def.income}/month`,
      `Garrison ${t.garrison.soldiers} soldiers, ${t.garrison.knights} knights`,
    ];
    if (owner && !owner.isPlayer) lines.push(`Their gold: ${owner.gold}`);
    return lines.join('\n');
  }

  private openBuy(): void {
    openBuyDialog(this, this.state, this.player.id, this.selected, () => {
      session.save();
      this.refresh();
    });
  }

  private attack(): void {
    if (this.selected) this.act({ type: 'conquer', target: this.selected });
  }

  private raid(): void {
    const rival = this.selectedRival();
    if (rival) this.act({ type: 'raid', target: rival.id });
  }

  private joust(stake: 'fame' | 'land'): void {
    const rival = this.selectedRival();
    if (rival) this.act({ type: 'tournament', opponent: rival.id, stake });
  }

  /** Plays the player's main action, reports it, then lets the AI lords move. */
  private act(action: Action): void {
    if (!this.isPlayerTurn()) return;
    const armyBefore = { ...this.player.army };
    let result;
    try {
      result = playTurn(this.state, action);
    } catch (e) {
      if (e instanceof RuleError) {
        showDialog(this, 'Not possible', e.message, [{ label: 'OK' }]);
        return;
      }
      throw e;
    }
    this.busy = true;
    this.refresh();

    const lines = [...result.messages];
    if (action.type === 'conquer' || (action.type === 'raid' && !result.won)) {
      lines.push(losses(armyBefore, this.player.army));
    }
    const title = action.type === 'pass' ? 'The Month Passes' : result.won ? 'Victory!' : 'Defeat';
    showDialog(this, title, lines.join('\n'), [{ label: 'Continue', onClick: () => void this.runAiTurns() }]);
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => this.time.delayedCall(ms, resolve));
  }

  private async runAiTurns(): Promise<void> {
    this.busy = true;
    this.selected = null;
    while (this.state.status === 'playing' && !currentLord(this.state).isPlayer) {
      this.refresh();
      await this.wait(AI_TURN_DELAY_MS);
      playAiTurn(this.state);
    }
    this.busy = false;
    if (this.state.status !== 'playing') {
      this.refresh();
      this.endGame();
      return;
    }
    session.save();
    this.refresh();
  }

  private endGame(): void {
    const won = this.state.status === 'won';
    session.clear();
    this.time.delayedCall(800, () => this.scene.start(SceneKeys.GameOver, { won }));
  }
}
