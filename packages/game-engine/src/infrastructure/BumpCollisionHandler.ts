import type { CollisionHandler } from './CollisionHandler';
import type { BumpHit } from '../use-cases/BumpHit';
import { BUMP_HIT_COOLDOWN_MS, BUMP_EJECT_SCALE } from '../domain/Ball';

/**
 * Handles collisions with side bumps (roles: 'bump_left', 'bump_right').
 *
 * A per-side cooldown prevents multiple consecutive ejections during a single
 * prolonged contact (Rapier may emit several 'started' events in a row).
 */
export class BumpCollisionHandler implements CollisionHandler {
  // Timestamp of the last hit per side, used for the anti-spam cooldown.
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
