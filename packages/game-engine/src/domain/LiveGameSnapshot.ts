/**
 * Snapshot d'état lu par les hooks UI qui doivent émettre des events
 * réseau (DMD display, score broadcast) sans accéder aux refs internes
 * de useGameState.
 */
export interface LiveGameSnapshot {
  score: number;
  lives: number;
  combo: number;
  multiplier: number;
  player: string;
  gameState: 'idle' | 'playing' | 'game_over';
}
