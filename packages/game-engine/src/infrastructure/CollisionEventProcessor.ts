import * as RAPIER from '@dimforge/rapier3d-compat';
import type { BossId } from '../domain/BossRegistry';
import type { GameEventListener } from '../domain/GameEvents';
import type { MapLayout } from '../domain/MapLayout';
import type { BumperHit } from '../use-cases/BumperHit';
import type { BumpHit } from '../use-cases/BumpHit';
import type { DrainBall } from '../use-cases/DrainBall';
import type { BottomOutBall } from '../use-cases/BottomOutBall';
import { AlternateWorldState } from './AlternateWorldState';
import { BossFightManager } from './BossFightManager';
import type { CollisionHandler } from './CollisionHandler';
import { BumperCollisionHandler } from './BumperCollisionHandler';
import { BumpCollisionHandler } from './BumpCollisionHandler';
import { BottomOutCollisionHandler } from './BottomOutCollisionHandler';
import { SlingshotCollisionHandler } from './SlingshotCollisionHandler';
import { PopZoneCollisionHandler } from './PopZoneCollisionHandler';
import { ScoopCollisionHandler } from './ScoopCollisionHandler';
import { RocketRampCollisionHandler } from './RocketRampCollisionHandler';
import { DropTargetCollisionHandler } from './DropTargetCollisionHandler';
import { PortalCollisionHandler } from './PortalCollisionHandler';
import { BossCollisionHandler } from './BossCollisionHandler';

export class CollisionEventProcessor {
  private readonly bossFights: BossFightManager;
  private readonly worldState = new AlternateWorldState();
  private pendingPhysics: Array<() => void> = [];
  private readonly handlers: CollisionHandler[] = [];
  private readonly portalHandler: PortalCollisionHandler;
  private readonly dropTargetHandler: DropTargetCollisionHandler;
  private readonly bossHandler: BossCollisionHandler;

  private gateContext() {
    return this.worldState.gateContext();
  }

  getNormalWorldScoreBaseline(): number {
    return this.worldState.getNormalWorldScoreBaseline();
  }

  getAlternateWorldScoreBaseline(): number {
    return this.worldState.getAlternateWorldScoreBaseline();
  }

  isAlternateWorldActive(): boolean {
    return this.worldState.isActive();
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
    this.resetLockedHitThrottle();
  }

  resetLockedHitThrottle(id?: BossId): void {
    this.bossHandler.resetThrottle(id);
  }

  onAlternateWorldEntered(score: number): void {
    this.worldState.enter(score);
  }

  resetAlternateWorldSession(): void {
    this.worldState.resetSession();
    this.bossFights.resetAlternateWorldBosses();
  }

  resetScoreBaselines(): void {
    this.worldState.resetScoreBaselines();
  }

  completeWorldCycle(score: number): void {
    this.worldState.completeCycle(score);
    this.portalHandler.resetPortalTrigger();
    this.resetAllBossFights();
  }

  tryAllBossReveals(totalScore: number, gameState: string): void {
    this.worldState.setLastTotalScore(totalScore);
    this.bossFights.tryAllReveals({
      ...this.worldState.gateContext(),
      gameState,
    });
  }

  debugRevealBoss(id: BossId, gameState: string): void {
    this.bossFights.forceReveal(id, gameState);
  }

  debugBossTargetHit(id: BossId, gameState: string): void {
    this.bossFights.forceTargetHit(id, gameState);
  }

  constructor(
    private readonly layout: MapLayout,
    private readonly colliderMap: Map<number, string>,
    bumperHitUC: BumperHit,
    bumpHitUC: BumpHit,
    _drainBallUC: DrainBall,
    bottomOutBallUC: BottomOutBall,
    private readonly emit: GameEventListener,
    private readonly now: () => number = () => performance.now(),
  ) {
    this.bossFights = new BossFightManager(emit, layout.bosses, this.now);

    this.dropTargetHandler = new DropTargetCollisionHandler(emit, layout);
    this.portalHandler = new PortalCollisionHandler(emit, () => this.worldState.isActive());
    this.bossHandler = new BossCollisionHandler(
      layout.bosses,
      this.bossFights,
      emit,
      () => this.worldState.isActive(),
      () => this.gateContext(),
      this.now,
    );
    this.handlers = [
      this.bossHandler,
      new BumperCollisionHandler(this.pendingPhysics, bumperHitUC, layout),
      new BumpCollisionHandler(this.pendingPhysics, bumpHitUC, this.now),
      new BottomOutCollisionHandler(
        this.pendingPhysics,
        () => this.dropTargetHandler.resetDropTargets(),
        bottomOutBallUC,
      ),
      new SlingshotCollisionHandler(emit),
      new PopZoneCollisionHandler(emit),
      new ScoopCollisionHandler(emit),
      new RocketRampCollisionHandler(emit),
      this.dropTargetHandler,
      this.portalHandler,
    ];
  }

  process(eventQueue: RAPIER.EventQueue, gameState: string): void {
    eventQueue.drainCollisionEvents((h1, h2, started) => {
      const role = this.colliderMap.get(h1) ?? this.colliderMap.get(h2);
      if (!role) return;

      const handler = this.handlers.find(h => h.canHandle(role));
      handler?.handle(role, gameState, started);
    });
  }

  flushPendingPhysics(): void {
    if (this.pendingPhysics.length === 0) return;
    const pending = this.pendingPhysics.splice(0);
    for (const run of pending) run();
  }
}
