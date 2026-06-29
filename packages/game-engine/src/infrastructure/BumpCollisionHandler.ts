import type { CollisionHandler } from './CollisionHandler';
import type { BumpHit } from '../use-cases/BumpHit';
import { BUMP_HIT_COOLDOWN_MS, BUMP_EJECT_SCALE } from '../domain/Ball';

/**
 * Gère les collisions avec les bumps latéraux (rôles : 'bump_left', 'bump_right').
 *
 * Un cooldown par côté évite de déclencher plusieurs éjections consécutives
 * lors d'un même contact prolongé (Rapier peut émettre plusieurs événements start).
 */
export class BumpCollisionHandler implements CollisionHandler {
  // Timestamp du dernier hit par côté, pour le cooldown anti-spam.
  private bumpLastHitMs: Record<'left' | 'right', number> = { left: 0, right: 0 };

  constructor(
    private readonly pendingPhysics: Array<() => void>,
    private readonly bumpHitUC: BumpHit,
  ) {}

  canHandle(role: string): boolean {
    return role === 'bump_right' || role === 'bump_left';
  }

  handle(role: string, gameState: string, started: boolean): void {
    if (!started || gameState !== 'playing') return;
    const side = role === 'bump_right' ? 'right' as const : 'left' as const;
    const now = performance.now();
    if (now - this.bumpLastHitMs[side] >= BUMP_HIT_COOLDOWN_MS) {
      this.bumpLastHitMs[side] = now;
      this.pendingPhysics.push(() => this.bumpHitUC.execute(side, BUMP_EJECT_SCALE));
    }
  }
}
