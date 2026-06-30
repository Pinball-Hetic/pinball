import type { CollisionHandler } from './CollisionHandler';
import type { BottomOutBall } from '../use-cases/BottomOutBall';

/**
 * Handles the collision with the playfield floor (role: 'bottom_out').
 *
 * Distinct from drain: bottom_out fires when the ball leaves the playfield
 * without going through the drain channel (out-of-bounds ball).
 * Unlike drain, BottomOutBall respawns the ball without decrementing lives.
 * Execution is deferred via pendingPhysics (mutating Rapier mid-step is forbidden).
 */
export class BottomOutCollisionHandler implements CollisionHandler {
  constructor(
    private readonly pendingPhysics: Array<() => void>,
    private readonly resetDropTargets: () => void,
    private readonly bottomOutBallUC: BottomOutBall,
  ) {}

  canHandle(role: string): boolean {
    return role === 'bottom_out';
  }

  handle(role: string, gameState: string, started: boolean): void {
    if (!started || gameState !== 'playing') return;
    this.pendingPhysics.push(() => {
      this.bottomOutBallUC.execute();
      this.resetDropTargets();
    });
  }
}
