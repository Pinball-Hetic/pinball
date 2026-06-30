import type { CollisionHandler } from './CollisionHandler';
import type { BossId, BossDefinition, BossGateContext } from '../domain/BossRegistry';
import { bossThresholdMet, bossPointsRemaining } from '../domain/BossRegistry';
import type { GameEventListener } from '../domain/GameEvents';
import type { BossFightManager } from './BossFightManager';

/**
 * Handles collisions on boss target colliders (roles defined by the map via
 * BossDefinition.colliderRole).
 *
 * Two responsibilities, in order:
 *   1. Locked-hit feedback : when the ball hits a boss target whose reveal
 *      threshold is not yet met, emit BOSS_LOCKED_HIT — throttled to once
 *      every 2s per boss (anti-spam) via the injected clock.
 *   2. Fight collision : delegate to BossFightManager.handleTargetCollision,
 *      which credits BOSS_TARGET_HIT when the fight is armed.
 *
 * canHandle() owns every boss collider role, so this handler must be registered
 * FIRST in the processor: a boss role is always consumed here and never falls
 * through to the generic handlers (identical to the previous inline behaviour).
 */
export class BossCollisionHandler implements CollisionHandler {
  // Last BOSS_LOCKED_HIT emission per boss, used for the 2s anti-spam throttle.
  private lockedHitLastMs: Partial<Record<BossId, number>> = {};
  private readonly bossByRole = new Map<string, BossDefinition>();

  constructor(
    private readonly bosses: BossDefinition[],
    private readonly bossFights: BossFightManager,
    private readonly emit: GameEventListener,
    /** Reads the live alternate-world flag without coupling to the processor. */
    private readonly getAlternateWorldActive: () => boolean,
    /** Reads the live gate context (score baselines) for threshold checks. */
    private readonly getGateContext: () => BossGateContext,
    // Injected clock (DIP): defaults to performance.now in production, a
    // controllable fake in tests — makes the anti-spam throttle deterministic.
    private readonly now: () => number = () => performance.now(),
  ) {
    for (const b of bosses) this.bossByRole.set(b.colliderRole, b);
  }

  canHandle(role: string): boolean {
    return this.bossByRole.has(role);
  }

  handle(role: string, gameState: string, started: boolean): void {
    const boss = this.bossByRole.get(role);

    // --- Locked-hit feedback (takes priority over the fight collision) ---
    if (
      boss
      && boss.reveal.requiresAlternateWorld === this.getAlternateWorldActive()
      && started
      && gameState === 'playing'
      && !this.bossFights.isTriggered(boss.id)
    ) {
      const ctx = this.getGateContext();
      if (!bossThresholdMet(boss, ctx)) {
        // Anti-spam: do not re-emit BOSS_LOCKED_HIT more than once every 2s.
        const now = this.now();
        if (now - (this.lockedHitLastMs[boss.id] ?? 0) >= 2000) {
          this.lockedHitLastMs[boss.id] = now;
          this.emit({
            type: 'BOSS_LOCKED_HIT',
            bossId: boss.id,
            remaining: bossPointsRemaining(boss, ctx),
          });
        }
      }
    }

    // Delegate the fight collision; the role is always a boss role here.
    this.bossFights.handleTargetCollision(role, started, gameState);
  }
}
