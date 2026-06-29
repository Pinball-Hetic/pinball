import type { CollisionHandler } from './CollisionHandler';
import type { BumperHit } from '../use-cases/BumperHit';
import type { MapLayout } from '../domain/MapLayout';

/**
 * Gère les collisions avec les bumpers (rôle : 'bumper_<index>').
 *
 * L'exécution du use-case est différée dans pendingPhysics pour éviter
 * de modifier l'état Rapier depuis un callback de drainCollisionEvents
 * (interdit mid-step).
 */
export class BumperCollisionHandler implements CollisionHandler {
  constructor(
    private readonly pendingPhysics: Array<() => void>,
    private readonly bumperHitUC: BumperHit,
    private readonly layout: MapLayout,
  ) {}

  canHandle(role: string): boolean {
    return role.startsWith('bumper_');
  }

  handle(role: string, gameState: string, started: boolean): void {
    if (!started) return;
    // L'index du bumper est encodé dans le rôle GLB (ex. 'bumper_2' → idx 2).
    const idx = parseInt(role.split('_')[1], 10);
    const pos = this.layout.bumpers[idx];
    if (pos) {
      this.pendingPhysics.push(() => this.bumperHitUC.execute(idx, pos));
    }
  }
}
