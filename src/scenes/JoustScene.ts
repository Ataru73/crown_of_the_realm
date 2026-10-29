import { SceneKeys } from '../config';
import { MinigameScene } from './MinigameScene';

export class JoustScene extends MinigameScene {
  protected readonly kind = 'joust';
  protected readonly title = 'The Tournament';
  protected readonly color = 0x6a4a1a;

  constructor() {
    super(SceneKeys.Joust);
  }
}
