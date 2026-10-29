/** Logical resolution: 2x the Amiga's 320x200. */
export const WIDTH = 640;
export const HEIGHT = 400;

export const SceneKeys = {
  Boot: 'Boot',
  Title: 'Title',
  HeroSelect: 'HeroSelect',
  Map: 'Map',
  Joust: 'Joust',
  Sword: 'Sword',
  Siege: 'Siege',
  Battle: 'Battle',
  Cutscene: 'Cutscene',
  GameOver: 'GameOver',
} as const;

export type SceneKey = (typeof SceneKeys)[keyof typeof SceneKeys];
