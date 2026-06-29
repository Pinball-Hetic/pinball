import type { GameEventListener } from '../domain/GameEvents';
import { SCORE_SLINGSHOT } from '../domain/ScoringConstants';
import type { CollisionHandler } from './CollisionHandler';

/**
 * Gère les collisions avec les slingshots (rôles : 'slingshot_left', 'slingshot_right').
 *
 * Émet SLINGSHOT_HIT avec le côté touché. L'impulsion physique de rebond
 * est appliquée directement par Rapier via le collider ; ce handler se
 * limite à scorer et notifier.
 */
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
