import type { CollisionHandler } from './CollisionHandler';
import type { DrainBall } from '../use-cases/DrainBall';

/**
 * Handles the collision with the drain (role: 'drain').
 *
 * Drop targets are reset alongside the ball drain to keep the playfield
 * in a consistent state for the next ball.
 * Execution is deferred via pendingPhysics (mutating Rapier mid-step is forbidden).
 */
export class DrainCollisionHandler implements CollisionHandler {
  constructor(
    private readonly pendingPhysics: Array<() => void>,
    private readonly resetDropTargets: () => void,
    private readonly drainBallUC: DrainBall,
  ) {}

  canHandle(role: string): boolean {
    return role === 'drain';
  }

  handle(role: string, gameState: string, started: boolean): void {
    if (!started || gameState !== 'playing') return;
    this.pendingPhysics.push(() => {
      this.drainBallUC.execute();
      this.resetDropTargets();
    });
  }
}
