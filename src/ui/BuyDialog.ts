import Phaser from 'phaser';
import { HEIGHT, WIDTH } from '../config';
import { buildCastle, buy, income, PRICES, upkeep, type Unit } from '../model/economy';
import { addArmies } from '../model/army';
import { territoryDef } from '../model/map';
import type { GameState, LordId, TerritoryId } from '../model/types';
import { Button } from './Button';
import { addParchment } from './assets';
import { textStyle } from './theme';
import { sfx } from './audio';
import { pushModal } from './modal';

const DEPTH = 100;

interface Row {
  unit: Unit;
  label: string;
  steps: number[];
}

const ROWS: Row[] = [
  { unit: 'soldier', label: 'Soldiers', steps: [1, 10] },
  { unit: 'knight', label: 'Knights', steps: [1, 5] },
  { unit: 'catapult', label: 'Catapults', steps: [1] },
];

/**
 * Lets the lord spend gold on troops (and a castle on the selected territory).
 * Purchases happen immediately and don't use up the turn. Keys 1 to 5 press
 * the + buttons in order, C builds the castle and Enter closes.
 */
export function openBuyDialog(
  scene: Phaser.Scene,
  state: GameState,
  lordId: LordId,
  selected: TerritoryId | null,
  onClose: () => void,
): void {
  const lord = state.lords[lordId];
  const blocker = scene.add.rectangle(0, 0, WIDTH, HEIGHT, 0x000000, 0.55).setOrigin(0).setInteractive().setDepth(DEPTH);
  const { fill, frame } = addParchment(scene, 0, 0, 440, 300, 3);
  const title = scene.add.text(0, -128, 'Muster the Army', textStyle(20)).setOrigin(0.5);
  const goldText = scene.add.text(0, -102, '', textStyle(13)).setOrigin(0.5);
  const container = scene.add.container(WIDTH / 2, HEIGHT / 2, [fill, frame, title, goldText]).setDepth(DEPTH + 1);
  pushModal(scene, container);

  const updaters: (() => void)[] = [];
  const refreshAll = () => updaters.forEach((u) => u());
  const small = { width: 46, height: 24, fontSize: 13 };

  updaters.push(() =>
    goldText.setText(
      `Gold: ${lord.gold}    Income: ${income(state, lordId)}/month    Upkeep: ${upkeep(addArmies(lord.army, lord.reserve))}/month`,
    ),
  );

  const digits = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'];
  let n = 0;
  ROWS.forEach((row, i) => {
    const y = -65 + i * 38;
    const label = scene.add.text(-195, y, '', textStyle(14)).setOrigin(0, 0.5);
    container.add(label);
    updaters.push(() =>
      label.setText(`${row.label} (${PRICES[row.unit]}g)   you have ${lord.army[`${row.unit}s`] + lord.reserve[`${row.unit}s`]}`),
    );
    row.steps.forEach((qty, j) => {
      const button = new Button(scene, 110 + j * 54, y, `+${qty}`, () => {
        buy(state, lordId, row.unit, qty);
        sfx(scene, 'coins', { volume: 0.5 });
        refreshAll();
      }, { ...small, keys: [digits[n++]] });
      container.add(button);
      updaters.push(() => button.setEnabled(lord.gold >= PRICES[row.unit] * qty));
    });
  });

  const castleY = -65 + ROWS.length * 38;
  const castleLabel = scene.add.text(-195, castleY, '', textStyle(14)).setOrigin(0, 0.5);
  const castleButton = new Button(scene, 137, castleY, 'Build', () => {
    if (selected) {
      buildCastle(state, lordId, selected);
      sfx(scene, 'coins', { volume: 0.5 });
    }
    refreshAll();
  }, { ...small, width: 100, keys: ['C'], keyLabel: 'C' });
  container.add([castleLabel, castleButton]);
  updaters.push(() => {
    const territory = selected ? state.territories[selected] : null;
    const canPlace = territory?.owner === lordId && !territory.castle;
    castleLabel.setText(
      canPlace
        ? `Castle at ${territoryDef(selected!).name} (${PRICES.castle}g)`
        : `Castle (${PRICES.castle}g): select a territory of yours without one`,
    );
    castleButton.setVisible(canPlace).setEnabled(canPlace && lord.gold >= PRICES.castle);
  });

  const note = scene.add.text(0, 80, '', textStyle(11, '#6a4a2a', { align: 'center' })).setOrigin(0.5);
  updaters.push(() => {
    const r = lord.reserve;
    const waiting =
      r.soldiers + r.knights + r.catapults > 0
        ? `Waiting at ${territoryDef(lord.home).name}: ${r.soldiers} soldiers, ${r.knights} knights, ${r.catapults} catapults.\nMarch home to join them.`
        : 'Troops muster at your home castle.';
    note.setText(`${waiting}\nUpkeep above income makes soldiers desert.\nKeys: 1 to 5 buy, in order · C builds · Enter is done`);
  });
  const done = new Button(scene, 0, 120, 'Done', () => {
    container.destroy();
    blocker.destroy();
    onClose();
  }, { width: 130, fontSize: 14, keys: ['ENTER', 'B'] });
  container.add([note, done]);

  refreshAll();
}
