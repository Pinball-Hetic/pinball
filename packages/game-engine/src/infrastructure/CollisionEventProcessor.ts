import RAPIER from '@dimforge/rapier3d-compat';
import type { BossId, BossDefinition } from '../domain/BossRegistry';
import {
  bossPointsRemaining,
  bossThresholdMet,
} from '../domain/BossRegistry';
import type { GameEventListener } from '../domain/GameEvents';
import type { MapLayout } from '../domain/MapLayout';
import type { BumperHit } from '../use-cases/BumperHit';
import type { BumpHit } from '../use-cases/BumpHit';
import type { DrainBall } from '../use-cases/DrainBall';
import type { BottomOutBall } from '../use-cases/BottomOutBall';
import { BossFightManager } from './BossFightManager';
import type { CollisionHandler } from './CollisionHandler';
import { BumperCollisionHandler } from './BumperCollisionHandler';
import { BumpCollisionHandler } from './BumpCollisionHandler';
import { DrainCollisionHandler } from './DrainCollisionHandler';
import { BottomOutCollisionHandler } from './BottomOutCollisionHandler';
import { SlingshotCollisionHandler } from './SlingshotCollisionHandler';
import { PopZoneCollisionHandler } from './PopZoneCollisionHandler';
import { RocketRampCollisionHandler } from './RocketRampCollisionHandler';
import { DropTargetCollisionHandler } from './DropTargetCollisionHandler';
import { PortalCollisionHandler } from './PortalCollisionHandler';

export class CollisionEventProcessor {
  private readonly bossFights: BossFightManager;
  private readonly bossByRole = new Map<string, BossDefinition>();
  private alternateWorldActive = false;
  private normalWorldScoreBaseline = 0;
  private alternateWorldScoreBaseline = 0;
  private lastTotalScore = 0;
  private lockedHitLastMs: Partial<Record<BossId, number>> = {};
  private pendingPhysics: Array<() => void> = [];
  private readonly handlers: CollisionHandler[] = [];
  private readonly portalHandler: PortalCollisionHandler;
  private readonly dropTargetHandler: DropTargetCollisionHandler;

  private gateContext() {
    return {
      totalScore: this.lastTotalScore,
      alternateWorldActive: this.alternateWorldActive,
      normalWorldScoreBaseline: this.normalWorldScoreBaseline,
      alternateWorldScoreBaseline: this.alternateWorldScoreBaseline,
    };
  }

  getNormalWorldScoreBaseline(): number {
    return this.normalWorldScoreBaseline;
  }

  getAlternateWorldScoreBaseline(): number {
    return this.alternateWorldScoreBaseline;
  }

  isAlternateWorldActive(): boolean {
    return this.alternateWorldActive;
  }

  isBossTriggered(id: BossId): boolean {
    return this.bossFights.isTriggered(id);
  }

  setPortalOpen(open: boolean): void {
    this.portalHandler.setPortalOpen(open);
  }

  resetPortalTrigger(): void {
    this.portalHandler.resetPortalTrigger();
  }

  resetDropTargets(): void {
    this.dropTargetHandler.resetDropTargets();
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

  onAlternateWorldEntered(score: number): void {
    this.alternateWorldActive = true;
    this.alternateWorldScoreBaseline = score;
  }

  resetAlternateWorldSession(): void {
    this.alternateWorldActive = false;
    this.alternateWorldScoreBaseline = 0;
    for (const b of this.layout.bosses) {
      if (b.reveal.requiresAlternateWorld) this.resetBossFight(b.id);
    }
  }

  resetScoreBaselines(): void {
    this.normalWorldScoreBaseline = 0;
    this.alternateWorldScoreBaseline = 0;
  }

  completeWorldCycle(score: number): void {
    this.alternateWorldActive = false;
    this.alternateWorldScoreBaseline = 0;
    this.normalWorldScoreBaseline = score;
    this.portalHandler.resetPortalTrigger();
    this.resetAllBossFights();
  }

  tryAllBossReveals(totalScore: number, gameState: string): void {
    this.lastTotalScore = totalScore;
    this.bossFights.tryAllReveals({
      totalScore,
      gameState,
      alternateWorldActive: this.alternateWorldActive,
      normalWorldScoreBaseline: this.normalWorldScoreBaseline,
      alternateWorldScoreBaseline: this.alternateWorldScoreBaseline,
    });
  }

  constructor(
    private readonly layout: MapLayout,
    private readonly colliderMap: Map<number, string>,
    bumperHitUC: BumperHit,
    bumpHitUC: BumpHit,
    drainBallUC: DrainBall,
    bottomOutBallUC: BottomOutBall,
    private readonly emit: GameEventListener,
  ) {
    this.bossFights = new BossFightManager(emit, layout.bosses);
    for (const b of layout.bosses) this.bossByRole.set(b.colliderRole, b);

    this.dropTargetHandler = new DropTargetCollisionHandler(emit, layout);
    this.portalHandler = new PortalCollisionHandler(emit, () => this.alternateWorldActive);

    this.handlers = [
      new BumperCollisionHandler(this.pendingPhysics, bumperHitUC, layout),
      new BumpCollisionHandler(this.pendingPhysics, bumpHitUC),
      new DrainCollisionHandler(
        this.pendingPhysics,
        () => this.dropTargetHandler.resetDropTargets(),
        drainBallUC,
      ),
      new BottomOutCollisionHandler(
        this.pendingPhysics,
        () => this.dropTargetHandler.resetDropTargets(),
        bottomOutBallUC,
      ),
      new SlingshotCollisionHandler(emit),
      new PopZoneCollisionHandler(emit),
      new RocketRampCollisionHandler(emit),
      this.dropTargetHandler,
      this.portalHandler,
    ];
  }

  process(eventQueue: RAPIER.EventQueue, gameState: string): void {
    eventQueue.drainCollisionEvents((h1, h2, started) => {
      const role = this.colliderMap.get(h1) ?? this.colliderMap.get(h2);
      if (!role) return;

      const boss = this.bossByRole.get(role);
      if (
        boss
        && boss.reveal.requiresAlternateWorld === this.alternateWorldActive
        && started
        && gameState === 'playing'
        && !this.bossFights.isTriggered(boss.id)
      ) {
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

      // Toute la cascade de if remplacée par deux lignes
      const handler = this.handlers.find(h => h.canHandle(role));
      handler?.handle(role, gameState, started);
    });
  }

  flushPendingPhysics(): void {
    if (this.pendingPhysics.length === 0) return;
    const pending = this.pendingPhysics;
    this.pendingPhysics = [];
    for (const run of pending) run();
  }
}
