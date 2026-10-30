import Phaser from 'phaser';
import { HEIGHT, SceneKeys, WIDTH } from '../config';
import { session } from '../game/session';
import { attackableTerritories, marchableTerritories, type Action, type Stake } from '../model/actions';
import { playAiTurn } from '../model/ai';
import { income, upkeep } from '../model/economy';
import { territoryDef } from '../model/map';
import { currentLord } from '../model/state';
import { dateLabel, playTurn } from '../model/turn';
import type { BattleResult } from '../model/combat';
import { RuleError, type Army, type GameState, type LordId, type TerritoryId } from '../model/types';
import { Button } from '../ui/Button';
import { openBuyDialog } from '../ui/BuyDialog';
import { showDialog } from '../ui/Dialog';
import { addBackdrop } from '../ui/assets';
import { MapView } from '../ui/MapView';
import { COLORS, textStyle } from '../ui/theme';

const PANEL_X = 462;
const PANEL_CENTER = PANEL_X + (WIDTH - PANEL_X) / 2;
const AI_TURN_DELAY_MS = 350;
const LOG_WIDTH = 200;

function losses(before: Army, after: Army): string {
  const s = before.soldiers - after.soldiers;
  const k = before.knights - after.knights;
  return `Losses: ${s} soldier${s === 1 ? '' : 's'}, ${k} knight${k === 1 ? '' : 's'}.`;
}

export interface MapSceneData {
  conquest?: { target: TerritoryId; result: BattleResult };
  tournament?: { opponent: LordId; stake: Stake; won: boolean };
  raid?: { target: LordId; won: boolean };
  rescue?: { won: boolean };
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
  private logBack!: Phaser.GameObjects.Rectangle;
  private buttons!: Record<'buy' | 'march' | 'attack' | 'raid' | 'rescue' | 'joustFame' | 'joustLand' | 'pass', Button>;

  constructor() {
    super(SceneKeys.Map);
  }

  /** A battle, joust or sword fight just fought in its own scene, to apply as this turn's action. */
  create(data: MapSceneData = {}): void {
    if (!session.state) {
      this.scene.start(SceneKeys.Title);
      return;
    }
    this.state = session.state;
    this.selected = null;
    this.busy = false;

    addBackdrop(this, 'map');
    this.map = new MapView(this, (id) => this.select(id));
    this.buildPanel();
    // The chronicle sits over the open sea in the map's top-left corner.
    this.logBack = this.add.rectangle(4, 4, LOG_WIDTH + 8, 0, 0x000000, 0.55).setOrigin(0);
    this.logText = this.add.text(8, 7, '', textStyle(10, '#f4e4bc', { lineSpacing: 1, wordWrap: { width: LOG_WIDTH } }));

    this.refresh();
    if (this.state.status !== 'playing') this.endGame();
    else if (!currentLord(this.state).isPlayer) void this.runAiTurns();
    else if (data.conquest) this.act({ type: 'conquer', ...data.conquest });
    else if (data.tournament) this.act({ type: 'tournament', ...data.tournament });
    else if (data.raid) this.act({ type: 'raid', ...data.raid });
    else if (data.rescue) this.act({ type: 'rescue', ...data.rescue });
  }

  private buildPanel(): void {
    this.add.tileSprite(PANEL_X, 0, WIDTH - PANEL_X, HEIGHT, 'parchment').setOrigin(0);
    this.add.rectangle(PANEL_X, 0, 3, HEIGHT, COLORS.border).setOrigin(0);
    this.dateText = this.add.text(PANEL_CENTER, 8, '', textStyle(15)).setOrigin(0.5, 0);
    this.lordText = this.add.text(PANEL_X + 10, 30, '', textStyle(11, '#3a2210', { lineSpacing: 2 }));
    this.infoText = this.add.text(PANEL_X + 10, 130, '', textStyle(11, '#3a2210', {
      lineSpacing: 2,
      wordWrap: { width: WIDTH - PANEL_X - 14 },
    }));

    const opts = { width: 156, height: 20, fontSize: 12 };
    const at = (i: number) => 214 + i * 23;
    this.buttons = {
      buy: new Button(this, PANEL_CENTER, at(0), 'Muster Army', () => this.openBuy(), opts),
      march: new Button(this, PANEL_CENTER, at(1), 'March', () => this.march(), opts),
      attack: new Button(this, PANEL_CENTER, at(2), 'Attack', () => this.attack(), opts),
      raid: new Button(this, PANEL_CENTER, at(3), 'Raid Castle', () => this.raid(), opts),
      rescue: new Button(this, PANEL_CENTER, at(4), 'Rescue Lady', () => this.rescue(), opts),
      joustFame: new Button(this, PANEL_CENTER, at(5), 'Joust for Fame', () => this.joust('fame'), opts),
      joustLand: new Button(this, PANEL_CENTER, at(6), 'Joust for Land', () => this.joust('land'), opts),
      pass: new Button(this, PANEL_CENTER, at(7), 'Rest (End Turn)', () => this.act({ type: 'pass' }), opts),
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
    const canMarch = turn && !!this.selected && marchableTerritories(s, p.id).includes(this.selected);
    this.buttons.buy.setEnabled(turn);
    this.buttons.march.setLabel(canMarch ? `March to ${name}` : 'March').setEnabled(canMarch);
    this.buttons.attack
      .setLabel(this.selected && attackable.has(this.selected) ? `Attack ${name}` : 'Attack')
      .setEnabled(turn && !!this.selected && attackable.has(this.selected));
    this.buttons.raid.setEnabled(turn && !!rival);
    this.buttons.rescue.setEnabled(turn && !!s.kidnap);
    this.buttons.joustFame.setEnabled(turn && !!rival);
    this.buttons.joustLand.setEnabled(turn && !!rival);
    this.buttons.pass.setEnabled(turn);

    this.logText.setText(s.log.slice(-3).join('\n'));
    this.logBack.setSize(LOG_WIDTH + 8, this.logText.text ? this.logText.height + 6 : 0);
  }

  private selectionInfo(): string {
    if (this.state.status !== 'playing') return 'The war is over.';
    if (this.busy) return `${currentLord(this.state).name} is moving...`;
    if (!this.selected) {
      const k = this.state.kidnap;
      if (k) return `Click a territory.\n${k.lady} is held by ${this.state.lords[k.captor].name}!`;
      return 'Click a territory.\nRed rings: lands your army can attack.';
    }
    const t = this.state.territories[this.selected];
    const def = territoryDef(t.id);
    const owner = t.owner ? this.state.lords[t.owner] : null;
    const lines = [
      `${def.name}${t.castle ? ' (castle)' : ''}`,
      `Held by ${owner ? owner.name : 'no lord'}`,
      `Income ${def.income} · ${t.garrison.soldiers} men, ${t.garrison.knights} knights`,
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

  private march(): void {
    if (this.selected) this.act({ type: 'march', target: this.selected });
  }

  /**
   * The battle itself is fought in the battle scene, which comes back here with the result.
   * A castle is first besieged when the army brings catapults.
   */
  private attack(): void {
    if (!this.selected || !this.isPlayerTurn()) return;
    const siege = this.state.territories[this.selected].castle && this.player.army.catapults > 0;
    this.scene.start(siege ? SceneKeys.Siege : SceneKeys.Battle, { target: this.selected });
  }

  private raid(): void {
    const rival = this.selectedRival();
    if (rival && this.isPlayerTurn()) this.scene.start(SceneKeys.Sword, { mission: 'raid', target: rival.id });
  }

  private rescue(): void {
    if (this.state.kidnap && this.isPlayerTurn()) this.scene.start(SceneKeys.Sword, { mission: 'rescue' });
  }

  private joust(stake: 'fame' | 'land'): void {
    const rival = this.selectedRival();
    if (rival && this.isPlayerTurn()) this.scene.start(SceneKeys.Joust, { opponent: rival.id, stake });
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
    if (action.type === 'conquer' || ((action.type === 'raid' || action.type === 'rescue') && !result.won)) {
      lines.push(losses(armyBefore, this.player.army));
    }
    const title =
      action.type === 'pass' || action.type === 'march' ? 'The Month Passes' : result.won ? 'Victory!' : 'Defeat';
    showDialog(this, title, lines.join('\n'), [{ label: 'Continue', onClick: () => void this.runAiTurns() }]);
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => this.time.delayedCall(ms, resolve));
  }

  private async runAiTurns(): Promise<void> {
    this.busy = true;
    this.selected = null;
    const kidnapBefore = this.state.kidnap;
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
    const k = this.state.kidnap;
    if (k && k !== kidnapBefore) {
      showDialog(
        this,
        'A Lady Is Taken!',
        `${this.state.lords[k.captor].name} has carried off ${k.lady} to his castle.\nRescue her before he forces her to wed him.`,
        [{ label: 'To Arms' }],
      );
    }
  }

  private endGame(): void {
    const won = this.state.status === 'won';
    session.clear();
    this.time.delayedCall(800, () => this.scene.start(SceneKeys.GameOver, { won }));
  }
}
