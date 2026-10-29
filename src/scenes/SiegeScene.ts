import { SceneKeys } from '../config';
import { MinigameScene } from './MinigameScene';

export class SiegeScene extends MinigameScene {
  protected readonly kind = 'siege';
  protected readonly title = 'The Siege';
  protected readonly color = 0x4a2a1a;

  constructor() {
    super(SceneKeys.Siege);
  }
}
