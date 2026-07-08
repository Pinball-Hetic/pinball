import type { CollisionHandler } from './CollisionHandler';
import type { BossId, BossDefinition, BossGateContext } from '../domain/BossRegistry';
import { bossThresholdMet, bossPointsRemaining } from '../domain/BossRegistry';
import type { GameEventListener } from '../domain/GameEvents';
import type { BossFightManager } from './BossFightManager';

export class BossCollisionHandler implements CollisionHandler {
  private lockedHitLastMs: Partial<Record<BossId, number>> = {};
  private readonly bossByRole = new Map<string, BossDefinition>();

  constructor(
    private readonly bosses: BossDefinition[],
    private readonly bossFights: BossFightManager,
    private readonly emit: GameEventListener,
    private readonly getAlternateWorldActive: () => boolean,
    private readonly getGateContext: () => BossGateContext,
    private readonly now: () => number = () => performance.now(),
  ) {
    for (const b of bosses) this.bossByRole.set(b.colliderRole, b);
  }

  canHandle(role: string): boolean {
    return this.bossByRole.has(role);
  }

  handle(role: string, gameState: string, started: boolean): void {
    const boss = this.bossByRole.get(role);

    if (
      boss
      && boss.reveal.requiresAlternateWorld === this.getAlternateWorldActive()
      && started
      && gameState === 'playing'
      && !this.bossFights.isTriggered(boss.id)
    ) {
      const ctx = this.getGateContext();
      if (!bossThresholdMet(boss, ctx)) {
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

    this.bossFights.handleTargetCollision(role, started, gameState);
  }

  resetThrottle(id?: BossId): void {
    if (id === undefined) {
      this.lockedHitLastMs = {};
      return;
    }
    delete this.lockedHitLastMs[id];
  }
}
