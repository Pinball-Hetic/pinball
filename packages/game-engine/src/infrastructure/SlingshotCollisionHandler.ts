import type { GameEventListener } from '../domain/GameEvents';
import { SCORE_SLINGSHOT } from '../domain/ScoringConstants';
import type { CollisionHandler } from './CollisionHandler';

export class SlingshotCollisionHandler implements CollisionHandler {
  constructor(
    private readonly emit: GameEventListener,
  ) {}

  canHandle(role: string): boolean {
    return role === 'slingshot_left' || role === 'slingshot_right';
  }

  handle(role: string, gameState: string, started: boolean): void {
    if (!started || gameState !== 'playing') return;
    const side = role === 'slingshot_left' ? 'left' as const : 'right' as const;
    this.emit({ type: 'SLINGSHOT_HIT', side, scoreIncrement: SCORE_SLINGSHOT });
  }
}