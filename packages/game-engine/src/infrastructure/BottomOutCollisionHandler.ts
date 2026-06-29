import type { CollisionHandler } from './CollisionHandler';
import type { BottomOutBall } from '../use-cases/BottomOutBall';

/**
 * Gère la collision avec le fond du terrain (rôle : 'bottom_out').
 *
 * Distinct du drain : bottom_out est déclenché quand la bille sort par le bas
 * sans passer par le couloir de drain (bille hors-terrain). Le use-case
 * BottomOutBall remet la bille en jeu sans décrémenter les vies.
 * L'exécution est différée dans pendingPhysics (interdit de modifier Rapier mid-step).
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
