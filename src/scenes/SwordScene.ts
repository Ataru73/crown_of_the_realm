import { SceneKeys } from '../config';
import { MinigameScene } from './MinigameScene';

export class SwordScene extends MinigameScene {
  protected readonly kind = 'sword';
  protected readonly title = 'Raid on the Castle';
  protected readonly color = 0x3a3a4a;

  constructor() {
    super(SceneKeys.Sword);
  }
}
