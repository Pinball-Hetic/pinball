import type { GameEventListener } from '../domain/GameEvents';
import { SCORE_SCOOP } from '../domain/ScoringConstants';
import type { CollisionHandler } from './CollisionHandler';

/**
 * Handles the ball entering the scoop / saucer hole (role: 'scoop').
 *
 * Passive detection only: emits SCOOP_ENTER once on contact start. The capture
 * sequence (hold the ball, grant rewards + timed multiplier, then eject) is
 * owned by the map module, which reacts to SCOOP_ENTER and drives the ball via
 * update(dt). This handler only scores and notifies.
 */
export class ScoopCollisionHandler implements CollisionHandler {
  constructor(
    private readonly emit: GameEventListener,
  ) {}

  canHandle(role: string): boolean {
    return role === 'scoop';
  }

  handle(role: string, gameState: string, started: boolean): void {
    if (!started || gameState !== 'playing') return;
    this.emit({ type: 'SCOOP_ENTER', scoreIncrement: SCORE_SCOOP });
  }
}
