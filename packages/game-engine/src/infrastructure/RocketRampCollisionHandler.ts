import type { GameEventListener } from '../domain/GameEvents';
import { SCORE_RAMP } from '../domain/ScoringConstants';
import type { CollisionHandler } from './CollisionHandler';

/**
 * Gère la collision avec la rampe fusée (rôle : 'rocket_ramp').
 *
 * Émet RAMP_HIT à chaque début de contact. La rampe n'a pas de cooldown
 * car sa géométrie ne génère qu'un seul événement 'started' par passage.
 */
export class RocketRampCollisionHandler implements CollisionHandler {
  constructor(
    private readonly emit: GameEventListener,
  ) {}

  canHandle(role: string): boolean {
    return role === 'rocket_ramp';
  }

  handle(role: string, gameState: string, started: boolean): void {
    if (!started || gameState !== 'playing') return;
    this.emit({ type: 'RAMP_HIT', scoreIncrement: SCORE_RAMP });
  }
}
