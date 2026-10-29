import { SceneKeys } from '../config';
import { MinigameScene } from './MinigameScene';

export class BattleScene extends MinigameScene {
  protected readonly kind = 'battle';
  protected readonly title = 'Field Battle';
  protected readonly color = 0x4a4a2a;

  constructor() {
    super(SceneKeys.Battle);
  }
}
