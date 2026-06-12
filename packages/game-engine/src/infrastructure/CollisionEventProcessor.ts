import RAPIER from '@dimforge/rapier3d-compat';
import type { BossId } from '../domain/BossRegistry';
import {
  bossPointsRemaining,
  bossThresholdMet,
  getBossByColliderRole,
} from '../domain/BossRegistry';
import type { GameEventListener } from '../domain/GameEvents';
import {
  BUMPER_POSITIONS,
  BUMP_EJECT_SCALE,
  BUMP_HIT_COOLDOWN_MS,
  DROP_TARGETS,
  PORTAL_ENTER_SCORE,
} from '../domain/Ball';
import {
  SCORE_SLINGSHOT,
  SCORE_POP_ZONE,
  SCORE_RAMP,
  SCORE_DROP_TARGET,
  SCORE_DROP_COMPLETE,
} from '../domain/ScoringConstants';
import type { BumperHit } from '../use-cases/BumperHit';
import type { BumpHit } from '../use-cases/BumpHit';
import type { DrainBall } from '../use-cases/DrainBall';
import type { BottomOutBall } from '../use-cases/BottomOutBall';
import { BossFightManager } from './BossFightManager';

export class CollisionEventProcessor {
  private dropTargetDown: Record<string, boolean> = {};
  private readonly bossFights: BossFightManager;
  private bumpLastHitMs: Record<'left' | 'right', number> = { left: 0, right: 0 };
  private portalOpen = false;
  private portalTriggered = false;
  private upsideDownActive = false;
  private upsideDownScoreBaseline = 0;
  private lastTotalScore = 0;
  // Throttle des events « nid verrouillé » par boss (anti-spam, 2 s).
  private lockedHitLastMs: Partial<Record<BossId, number>> = {};

  private gateContext() {
    return {
      totalScore: this.lastTotalScore,
      upsideDownActive: this.upsideDownActive,
      upsideDownScoreBaseline: this.upsideDownScoreBaseline,
    };
  }

  /** Baseline de score Upside Down (pour recalculer l'état des marqueurs de nid). */
  getUpsideDownScoreBaseline(): number {
    return this.upsideDownScoreBaseline;
  }

  isUpsideDownActive(): boolean {
    return this.upsideDownActive;
  }

  isBossTriggered(id: BossId): boolean {
    return this.bossFights.isTriggered(id);
  }

  setPortalOpen(open: boolean): void {
    this.portalOpen = open;
    if (!open) this.portalTriggered = false;
  }

  resetPortalTrigger(): void {
    this.portalTriggered = false;
  }

  setBossFightActive(id: BossId, active: boolean): void {
    this.bossFights.setFightActive(id, active);
  }

  setBossTargetArmed(id: BossId, armed: boolean): void {
    this.bossFights.setTargetArmed(id, armed);
  }

  resetBossFight(id: BossId): void {
    this.bossFights.resetBoss(id);
  }

  resetAllBossFights(): void {
    this.bossFights.resetAll();
  }

  onUpsideDownEntered(score: number): void {
    this.upsideDownActive = true;
    this.upsideDownScoreBaseline = score;
  }

  resetUpsideDownSession(): void {
    this.upsideDownActive = false;
    this.upsideDownScoreBaseline = 0;
    this.resetBossFight('vecna');
  }

  tryAllBossReveals(totalScore: number, gameState: string): void {
    this.lastTotalScore = totalScore;
    this.bossFights.tryAllReveals({
      totalScore,
      gameState,
      upsideDownActive: this.upsideDownActive,
      upsideDownScoreBaseline: this.upsideDownScoreBaseline,
    });
  }

  constructor(
    private readonly colliderMap: Map<number, string>,
    private readonly bumperHitUC: BumperHit,
    private readonly bumpHitUC: BumpHit,
    private readonly drainBallUC: DrainBall,
    private readonly bottomOutBallUC: BottomOutBall,
    private readonly emit: GameEventListener,
  ) {
    this.bossFights = new BossFightManager(emit);
    for (const dt of DROP_TARGETS) this.dropTargetDown[dt.id] = false;
  }

  process(eventQueue: RAPIER.EventQueue, gameState: string): void {
    eventQueue.drainCollisionEvents((h1, h2, started) => {
      const role = this.colliderMap.get(h1) ?? this.colliderMap.get(h2);
      if (!role) return;

      // Contact avec une cible de boss encore verrouillée (palier non atteint) :
      // pédagogie « ENCORE X PTS » plutôt qu'un hit silencieux. Throttle 2 s.
      const boss = getBossByColliderRole(role);
      if (boss && started && gameState === 'playing' && !this.bossFights.isTriggered(boss.id)) {
        const ctx = this.gateContext();
        if (!bossThresholdMet(boss, ctx)) {
          const now = performance.now();
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

      if (this.bossFights.handleTargetCollision(role, started, gameState)) {
        return;
      }

      if (role === 'portal_enter') {
        if (started && gameState === 'playing' && this.portalOpen && !this.portalTriggered) {
          this.portalTriggered = true;
          this.emit({ type: 'PORTAL_ENTER', scoreIncrement: PORTAL_ENTER_SCORE });
        }
        return;
      }

      if (!started) return;

      if (role.startsWith('bumper_')) {
        const idx = parseInt(role.split('_')[1], 10);
        const pos = BUMPER_POSITIONS[idx];
        if (pos) {
          this.bumperHitUC.execute(idx, pos);
        }
      }

      if (started && (role === 'bump_right' || role === 'bump_left') && gameState === 'playing') {
        const side = role === 'bump_right' ? 'right' as const : 'left' as const;
        const now = performance.now();
        if (now - this.bumpLastHitMs[side] >= BUMP_HIT_COOLDOWN_MS) {
          this.bumpLastHitMs[side] = now;
          this.bumpHitUC.execute(side, BUMP_EJECT_SCALE);
        }
      }

      if (role === 'bottom_out' && gameState === 'playing') {
        this.bottomOutBallUC.execute();
        this.resetDropTargets();
      }

      if (role === 'drain' && gameState === 'playing') {
        this.drainBallUC.execute();
        this.resetDropTargets();
      }

      if ((role === 'slingshot_left' || role === 'slingshot_right') && gameState === 'playing') {
        const side = role === 'slingshot_left' ? 'left' as const : 'right' as const;
        this.emit({ type: 'SLINGSHOT_HIT', side, scoreIncrement: SCORE_SLINGSHOT });
      }

      if (role.startsWith('pop_zone_') && gameState === 'playing') {
        this.emit({ type: 'ZONE_HIT', zone: role, scoreIncrement: SCORE_POP_ZONE });
      }

      if (role === 'rocket_ramp' && gameState === 'playing') {
        this.emit({ type: 'RAMP_HIT', scoreIncrement: SCORE_RAMP });
      }

      if (role.startsWith('drop_') && !role.startsWith('drop_target') && gameState === 'playing') {
        this.handleDropTarget(role);
      }
    });
  }

  resetDropTargets(): void {
    for (const dt of DROP_TARGETS) {
      this.dropTargetDown[dt.id] = false;
    }
    this.emit({ type: 'DROP_TARGET_RESET' });
  }

  private handleDropTarget(role: string): void {
    if (this.dropTargetDown[role]) return;

    this.dropTargetDown[role] = true;
    this.emit({ type: 'DROP_TARGET_HIT', targetId: role, scoreIncrement: SCORE_DROP_TARGET });

    const target = DROP_TARGETS.find((t) => t.id === role);
    if (!target) return;

    const sideTargets = DROP_TARGETS.filter((t) => t.side === target.side);
    const allDown = sideTargets.every((t) => this.dropTargetDown[t.id]);
    if (!allDown) return;

    this.emit({ type: 'DROP_TARGET_COMPLETE', side: target.side, scoreIncrement: SCORE_DROP_COMPLETE });

    for (const t of sideTargets) {
      this.dropTargetDown[t.id] = false;
    }
  }
}
