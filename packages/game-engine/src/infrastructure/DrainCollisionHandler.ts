import type { CollisionHandler } from './CollisionHandler';
import type { DrainBall } from '../use-cases/DrainBall';

/**
 * Gère la collision avec le drain (rôle : 'drain').
 *
 * Réinitialise les drop targets en même temps que la bille est drainée
 * pour remettre le terrain dans un état cohérent pour la prochaine bille.
 * L'exécution est différée dans pendingPhysics (interdit de modifier Rapier mid-step).
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
