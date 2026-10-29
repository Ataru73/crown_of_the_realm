export type MinigameKind = 'joust' | 'sword' | 'siege' | 'battle';

/** What a minigame scene hands back to the campaign map. */
export interface MinigameResult {
  kind: MinigameKind;
  outcome: 'win' | 'lose';
  /** Gold gained (raid) or lost; 0 when not relevant. */
  gold: number;
  /** Fame gained or lost. */
  fame: number;
}
