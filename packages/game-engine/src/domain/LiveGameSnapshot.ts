export interface LiveGameSnapshot {
  score: number;
  lives: number;
  combo: number;
  multiplier: number;
  player: string;
  gameState: 'idle' | 'playing' | 'game_over';
}
