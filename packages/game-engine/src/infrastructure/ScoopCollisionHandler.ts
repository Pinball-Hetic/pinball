import type { GameEventListener } from '../domain/GameEvents';
import { SCORE_SCOOP } from '../domain/ScoringConstants';
import type { CollisionHandler } from './CollisionHandler';

// Only emits SCOOP_ENTER; the capture sequence (hold, reward, eject) is owned
// by the map module reacting to that event.
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
