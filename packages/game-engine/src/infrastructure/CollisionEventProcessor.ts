import RAPIER from '@dimforge/rapier3d-compat';
import type { BossId } from '../domain/BossRegistry';
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
import { BottomOutCollisionHandler } from './BottomOutCollisionHandler';
import { SlingshotCollisionHandler } from './SlingshotCollisionHandler';
import { PopZoneCollisionHandler } from './PopZoneCollisionHandler';
import { RocketRampCollisionHandler } from './RocketRampCollisionHandler';
import { DropTargetCollisionHandler } from './DropTargetCollisionHandler';
import { PortalCollisionHandler } from './PortalCollisionHandler';
import { BossCollisionHandler } from './BossCollisionHandler';

export class CollisionEventProcessor {
  private readonly bossFights: BossFightManager;
  private alternateWorldActive = false;
  private normalWorldScoreBaseline = 0;
  private alternateWorldScoreBaseline = 0;
  private lastTotalScore = 0;
  private pendingPhysics: Array<() => void> = [];
  private readonly handlers: CollisionHandler[] = [];
  private readonly portalHandler: PortalCollisionHandler;
  private readonly dropTargetHandler: DropTargetCollisionHandler;
  private readonly bossHandler: BossCollisionHandler;

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
    this.resetLockedHitThrottle();
  }

  resetLockedHitThrottle(id?: BossId): void {
    this.bossHandler.resetThrottle(id);
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
    // Positional slot preserved for call-site compatibility. The real drain is
    // handled by BottomOutCollisionHandler (role 'bottom_out'); no collider is
    // ever created with role 'drain', so this use-case is no longer dispatched here.
    _drainBallUC: DrainBall,
    bottomOutBallUC: BottomOutBall,
    private readonly emit: GameEventListener,
    // Injected clock (DIP): defaults to performance.now in production, a
    // controllable fake in tests — makes the anti-spam throttles deterministic.
    private readonly now: () => number = () => performance.now(),
  ) {
    this.bossFights = new BossFightManager(emit, layout.bosses, this.now);

    // Kept as properties because they are exposed publicly (reset, state).
    this.dropTargetHandler = new DropTargetCollisionHandler(emit, layout);
    this.portalHandler = new PortalCollisionHandler(emit, () => this.alternateWorldActive);
    this.bossHandler = new BossCollisionHandler(
      layout.bosses,
      this.bossFights,
      emit,
      () => this.alternateWorldActive,
      () => this.gateContext(),
      this.now,
    );

    // Handler registry — declaration order = dispatch priority.
    // The first handler whose canHandle() returns true owns the collision.
    // BossCollisionHandler is first: a boss collider role is always consumed
    // here and never falls through to the generic handlers.
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
      new RocketRampCollisionHandler(emit),
      this.dropTargetHandler,
      this.portalHandler,
    ];
  }

  process(eventQueue: RAPIER.EventQueue, gameState: string): void {
    eventQueue.drainCollisionEvents((h1, h2, started) => {
      // Role resolution: one of the two handles in the pair is the ball.
      const role = this.colliderMap.get(h1) ?? this.colliderMap.get(h2);
      if (!role) return;

      // Dispatch to the registered handler for this role.
      // BossCollisionHandler is first and consumes every boss collider role.
      const handler = this.handlers.find(h => h.canHandle(role));
      handler?.handle(role, gameState, started);
    });
  }

  flushPendingPhysics(): void {
    if (this.pendingPhysics.length === 0) return;
    // Vide EN PLACE (splice) — ne PAS réassigner : les handlers de collision
    // capturent cette même référence de tableau à la construction. Un
    // `this.pendingPhysics = []` la détacherait → après le 1er flush, les
    // handlers pousseraient dans l'ancien tableau et plus rien ne s'exécuterait
    // (bumpers muets, drain/game-over jamais déclenchés).
    const pending = this.pendingPhysics.splice(0);
    for (const run of pending) run();
  }
}
