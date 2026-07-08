import type { GameEventListener } from '../domain/GameEvents';
import { SCORE_RAMP } from '../domain/ScoringConstants';
import type { CollisionHandler } from './CollisionHandler';

// No cooldown needed: the ramp geometry generates one 'started' event per pass.
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
