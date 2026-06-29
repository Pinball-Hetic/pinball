import type { GameEventListener } from '../domain/GameEvents';
import { SCORE_RAMP } from '../domain/ScoringConstants';
import type { CollisionHandler } from './CollisionHandler';

/**
 * Handles the collision with the rocket ramp (role: 'rocket_ramp').
 *
 * Emits RAMP_HIT on each contact start. No cooldown is needed because
 * the ramp geometry generates only one 'started' event per pass.
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
