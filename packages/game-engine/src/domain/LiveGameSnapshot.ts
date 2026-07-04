/**
 * State snapshot read by UI hooks that must emit network events (DMD display,
 * score broadcast) without touching useGameState's internal refs.
 */
export interface LiveGameSnapshot {
  score: number;
  lives: number;
  combo: number;
  multiplier: number;
  player: string;
  gameState: 'idle' | 'playing' | 'game_over';
}
