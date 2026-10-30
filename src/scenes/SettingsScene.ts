import Phaser from 'phaser';
import { HEIGHT, SceneKeys, WIDTH } from '../config';
import { VOLUME_STEP } from '../game/settings';
import { Button } from '../ui/Button';
import { addParchment } from '../ui/assets';
import { getSettings, onSettingsChange, toggleMute, updateSettings } from '../ui/audio';
import { textStyle } from '../ui/theme';

/** Scenes that can't be paused for the settings, or from which there's nothing to quit. */
const NO_QUIT = new Set<string>([SceneKeys.Title, SceneKeys.HeroSelect]);

/**
 * Opens the settings over whatever is on screen, pausing it, or closes them if
 * they're already open. Does nothing while the game is still loading.
 */
export function toggleSettings(game: Phaser.Game): void {
  const manager = game.scene;
  if (manager.isActive(SceneKeys.Settings)) {
    (manager.getScene(SceneKeys.Settings) as SettingsScene).close();
    return;
  }
  const under = manager.getScenes(true).map((s) => s.scene.key).filter((k) => k !== SceneKeys.Settings);
  if (under.length === 0 || under.includes(SceneKeys.Boot)) return;
  for (const key of under) manager.pause(key);
  manager.run(SceneKeys.Settings, { under });
}

/** Volume, sound and fullscreen, and a way back to the title; the game waits underneath. */
export class SettingsScene extends Phaser.Scene {
  private under: string[] = [];

  constructor() {
    super(SceneKeys.Settings);
  }

  create(data: { under: string[] }): void {
    this.under = data.under;
    this.add.rectangle(0, 0, WIDTH, HEIGHT, 0x000000, 0.6).setOrigin(0).setInteractive();
    const width = 360;
    const height = 290;
    addParchment(this, WIDTH / 2, HEIGHT / 2, width, height, 3);
    const top = HEIGHT / 2 - height / 2;
    const left = WIDTH / 2 - width / 2 + 30;
    const valueX = WIDTH / 2 + width / 2 - 82;
    this.add.text(WIDTH / 2, top + 22, 'Settings', textStyle(20)).setOrigin(0.5);

    const row = (i: number) => top + 62 + i * 34;
    const rowLabel = (i: number, text: string) => this.add.text(left, row(i), text, textStyle(14)).setOrigin(0, 0.5);
    const small = { width: 30, height: 24, fontSize: 14 };
    const wide = { width: 126, height: 24, fontSize: 14 };

    const volume = (i: number, text: string, key: 'musicVolume' | 'sfxVolume') => {
      rowLabel(i, text);
      const step = (dir: 1 | -1) => () => updateSettings({ [key]: getSettings()[key] + dir * VOLUME_STEP });
      new Button(this, valueX - 48, row(i), '−', step(-1), small);
      new Button(this, valueX + 48, row(i), '+', step(1), small);
      return this.add.text(valueX, row(i), '', textStyle(14)).setOrigin(0.5);
    };
    const music = volume(0, 'Music volume', 'musicVolume');
    const effects = volume(1, 'Effects volume', 'sfxVolume');
    rowLabel(2, 'Sound');
    const sound = new Button(this, valueX, row(2), '', toggleMute, wide);
    rowLabel(3, 'Full screen');
    const canFullscreen = this.sys.game.device.fullscreen.available;
    const fullscreen = new Button(this, valueX, row(3), '', () => this.scale.toggleFullscreen(), { ...wide, keys: ['F'] })
      .setEnabled(canFullscreen);

    const percent = (v: number) => `${Math.round(v * 100)}%`;
    const show = () => {
      const s = getSettings();
      music.setText(percent(s.musicVolume));
      effects.setText(percent(s.sfxVolume));
      sound.setLabel(s.mute ? 'Off  (M)' : 'On  (M)');
      fullscreen.setLabel(!canFullscreen ? 'Not available' : this.scale.isFullscreen ? 'On  (F)' : 'Off  (F)');
    };
    show();
    const unsubscribe = onSettingsChange(show);
    this.scale.on(Phaser.Scale.Events.ENTER_FULLSCREEN, show);
    this.scale.on(Phaser.Scale.Events.LEAVE_FULLSCREEN, show);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      unsubscribe();
      this.scale.off(Phaser.Scale.Events.ENTER_FULLSCREEN, show);
      this.scale.off(Phaser.Scale.Events.LEAVE_FULLSCREEN, show);
    });

    this.add
      .text(WIDTH / 2, row(4) - 4, 'Esc opens and closes this menu.', textStyle(11, '#6a4a2a'))
      .setOrigin(0.5);
    const quit = !this.under.some((k) => NO_QUIT.has(k));
    const buttonY = top + height - 30;
    new Button(this, quit ? WIDTH / 2 - 80 : WIDTH / 2, buttonY, 'Resume', () => this.close(), {
      width: 140,
      fontSize: 14,
      keys: ['ENTER'],
    });
    if (quit) {
      new Button(this, WIDTH / 2 + 80, buttonY, 'Quit to Title', () => this.quit(), { width: 140, fontSize: 14 });
      this.add
        .text(WIDTH / 2, buttonY - 28, 'The campaign was saved at the start of this month.', textStyle(11, '#6a4a2a'))
        .setOrigin(0.5);
    }
  }

  close(): void {
    for (const key of this.under) this.scene.resume(key);
    this.scene.stop();
  }

  private quit(): void {
    for (const key of this.under) this.scene.stop(key);
    this.scene.start(SceneKeys.Title);
  }
}
