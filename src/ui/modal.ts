import Phaser from 'phaser';

/** Open dialogs per scene, newest last; only the newest takes keyboard shortcuts. */
const stacks = new WeakMap<Phaser.Scene, Phaser.GameObjects.Container[]>();

/** Registers a dialog until its container is destroyed. */
export function pushModal(scene: Phaser.Scene, container: Phaser.GameObjects.Container): void {
  const stack = stacks.get(scene) ?? [];
  stacks.set(scene, stack);
  stack.push(container);
  container.once(Phaser.GameObjects.Events.DESTROY, () => stack.splice(stack.indexOf(container), 1));
}

function topModal(scene: Phaser.Scene): Phaser.GameObjects.Container | null {
  const stack = stacks.get(scene);
  return stack?.length ? stack[stack.length - 1] : null;
}

/** Whether `object` is in the newest dialog, or no dialog is open and it isn't in one. */
export function inFrontmostLayer(object: Phaser.GameObjects.GameObject): boolean {
  let root: Phaser.GameObjects.GameObject = object;
  while (root.parentContainer) root = root.parentContainer;
  const top = topModal(object.scene);
  return top ? root === top : !(stacks.get(object.scene) ?? []).includes(root as Phaser.GameObjects.Container);
}

/**
 * Calls `handler` on the scene's `keydown-<key>` for each key until `owner` is
 * destroyed, skipping auto-repeats so a held key doesn't click through screens.
 */
export function onKeys(
  scene: Phaser.Scene,
  keys: string[],
  handler: () => void,
  owner?: Phaser.GameObjects.GameObject,
): void {
  const kb = scene.input.keyboard;
  if (!kb) return;
  const listener = (e: KeyboardEvent) => {
    if (!e.repeat) handler();
  };
  for (const key of keys) kb.on(`keydown-${key}`, listener);
  owner?.once(Phaser.GameObjects.Events.DESTROY, () => {
    for (const key of keys) kb.off(`keydown-${key}`, listener);
  });
}

export function hasModal(scene: Phaser.Scene): boolean {
  return topModal(scene) !== null;
}
