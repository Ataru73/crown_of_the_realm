import type Phaser from 'phaser';

export const FONT = 'Georgia, serif';

export const COLORS = {
  sea: 0x1f3a52,
  parchment: 0xd8c08a,
  parchmentLight: 0xf0dca8,
  ink: 0x3a2210,
  border: 0x5a3a1a,
  neutral: 0x9a9480,
  selected: 0xffd34a,
  attackable: 0xff4a3a,
} as const;

const LORD_COLORS: Record<string, number> = {
  player: 0x2f6fd0,
  osric: 0x2e9e5b,
  leofric: 0x9cc23a,
  montclair: 0xc43c3c,
  vesci: 0xe07b25,
  aubigny: 0x9b3a8f,
};

export function lordColor(lordId: string | null): number {
  return lordId ? (LORD_COLORS[lordId] ?? 0xffffff) : COLORS.neutral;
}

export function textStyle(
  size: number,
  color = '#3a2210',
  extra: Phaser.Types.GameObjects.Text.TextStyle = {},
): Phaser.Types.GameObjects.Text.TextStyle {
  return { fontFamily: FONT, fontSize: `${size}px`, color, ...extra };
}
