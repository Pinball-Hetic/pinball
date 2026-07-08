import type { CollisionHandler } from './CollisionHandler';
import type { BumpHit } from '../use-cases/BumpHit';
import { BUMP_HIT_COOLDOWN_MS, BUMP_EJECT_SCALE } from '../domain/Ball';

// Per-side cooldown: Rapier may emit several 'started' events in a row for one
// prolonged contact, which would otherwise trigger multiple ejections.
export class BumpCollisionHandler implements CollisionHandler {
  private bumpLastHitMs: Record<'left' | 'right', number> = { left: 0, right: 0 };

  constructor(
    private readonly pendingPhysics: Array<() => void>,
    private readonly bumpHitUC: BumpHit,
    private readonly now: () => number = () => performance.now(),
  ) {}

  canHandle(role: string): boolean {
    return role === 'bump_right' || role === 'bump_left';
  }

  handle(role: string, gameState: string, started: boolean): void {
    if (!started || gameState !== 'playing') return;
    const side = role === 'bump_right' ? 'right' as const : 'left' as const;
    const now = this.now();
    if (now - this.bumpLastHitMs[side] >= BUMP_HIT_COOLDOWN_MS) {
      this.bumpLastHitMs[side] = now;
      this.pendingPhysics.push(() => this.bumpHitUC.execute(side, BUMP_EJECT_SCALE));
    }
  }
}
