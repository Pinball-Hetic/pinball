import RAPIER from '@dimforge/rapier3d-compat';
import type { GameEventListener } from '../domain/GameEvents';
import { BUMPER_POSITIONS, DROP_TARGETS, DEMOGORGON_TARGET_HITS, VECNA_TARGET_HITS, PORTAL_ENTER_SCORE } from '../domain/Ball';
import {
  SCORE_SLINGSHOT,
  SCORE_POP_ZONE,
  SCORE_RAMP,
  SCORE_DEMOGORGON_REVEAL,
  DEMOGORGON_REVEAL_SCORE,
  SCORE_DEMOGORGON_TARGET,
  SCORE_VECNA_REVEAL,
  VECNA_REVEAL_SCORE,
  SCORE_VECNA_TARGET,
  SCORE_DROP_TARGET,
  SCORE_DROP_COMPLETE,
} from '../domain/ScoringConstants';
import type { BumperHit } from '../use-cases/BumperHit';
import type { DrainBall } from '../use-cases/DrainBall';
import type { BottomOutBall } from '../use-cases/BottomOutBall';

export class CollisionEventProcessor {
  private dropTargetDown: Record<string, boolean> = {};
  private demogorgonTriggered = false;
  private demogorgonFightActive = false;
  private demogorgonTargetArmed = false;
  private demogorgonTargetBallInside = false;
  private demogorgonTargetLatchIgnore = false;
  private demogorgonTargetHits = 0;
  private demogorgonTargetLastHitMs = 0;
  private portalOpen = false;
  private portalTriggered = false;
  private upsideDownActive = false;
  private upsideDownScoreBaseline = 0;
  private vecnaTriggered = false;
  private vecnaFightActive = false;
  private vecnaTargetArmed = false;
  private vecnaTargetBallInside = false;
  private vecnaTargetLatchIgnore = false;
  private vecnaTargetHits = 0;
  private vecnaTargetLastHitMs = 0;

  setPortalOpen(open: boolean): void {
    this.portalOpen = open;
    if (!open) this.portalTriggered = false;
  }

  resetPortalTrigger(): void {
    this.portalTriggered = false;
  }

  setDemogorgonFightActive(active: boolean): void {
    this.demogorgonFightActive = active;
    if (!active) {
      this.demogorgonTargetArmed = false;
      this.demogorgonTargetLatchIgnore = false;
    }
  }

  setDemogorgonTargetArmed(armed: boolean): void {
    this.demogorgonTargetArmed = armed;
    if (armed && this.demogorgonTargetBallInside) {
      this.demogorgonTargetLatchIgnore = true;
    }
  }

  resetDemogorgonFight(): void {
    this.demogorgonTriggered = false;
    this.demogorgonFightActive = false;
    this.demogorgonTargetArmed = false;
    this.demogorgonTargetLatchIgnore = false;
    this.demogorgonTargetBallInside = false;
    this.demogorgonTargetHits = 0;
    this.demogorgonTargetLastHitMs = 0;
  }

  onUpsideDownEntered(score: number): void {
    this.upsideDownActive = true;
    this.upsideDownScoreBaseline = score;
  }

  resetUpsideDownSession(): void {
    this.upsideDownActive = false;
    this.upsideDownScoreBaseline = 0;
    this.resetVecnaFight();
  }

  setVecnaFightActive(active: boolean): void {
    this.vecnaFightActive = active;
    if (!active) {
      this.vecnaTargetArmed = false;
      this.vecnaTargetLatchIgnore = false;
    }
  }

  setVecnaTargetArmed(armed: boolean): void {
    this.vecnaTargetArmed = armed;
    if (armed && this.vecnaTargetBallInside) {
      this.vecnaTargetLatchIgnore = true;
    }
  }

  resetVecnaFight(): void {
    this.vecnaTriggered = false;
    this.vecnaFightActive = false;
    this.vecnaTargetArmed = false;
    this.vecnaTargetLatchIgnore = false;
    this.vecnaTargetBallInside = false;
    this.vecnaTargetHits = 0;
    this.vecnaTargetLastHitMs = 0;
  }

  tryVecnaReveal(totalScore: number, gameState: string): void {
    if (gameState !== 'playing') return;
    if (!this.upsideDownActive) return;
    if (this.vecnaTriggered) return;
    if (totalScore - this.upsideDownScoreBaseline < VECNA_REVEAL_SCORE) return;
    this.beginVecnaFight(false);
    this.emit({ type: 'VECNA_REVEAL', scoreIncrement: SCORE_VECNA_REVEAL });
  }

  tryScoreReveal(totalScore: number, gameState: string): void {
    if (gameState !== 'playing') return;
    if (this.demogorgonTriggered) return;
    if (totalScore < DEMOGORGON_REVEAL_SCORE) return;
    this.demogorgonTriggered = true;
    this.demogorgonFightActive = true;
    this.demogorgonTargetArmed = false;
    this.demogorgonTargetLatchIgnore = false;
    this.demogorgonTargetHits = 0;
    this.demogorgonTargetLastHitMs = 0;
    this.emit({ type: 'DEMOGORGON_REVEAL', scoreIncrement: SCORE_DEMOGORGON_REVEAL });
  }

  constructor(
    private readonly colliderMap: Map<number, string>,
    private readonly bumperHitUC: BumperHit,
    private readonly drainBallUC: DrainBall,
    private readonly bottomOutBallUC: BottomOutBall,
    private readonly emit: GameEventListener,
  ) {
    for (const dt of DROP_TARGETS) this.dropTargetDown[dt.id] = false;
  }

  process(eventQueue: RAPIER.EventQueue, gameState: string): void {
    eventQueue.drainCollisionEvents((h1, h2, started) => {
      const role = this.colliderMap.get(h1) ?? this.colliderMap.get(h2);
      if (!role) return;

      if (role === 'demogorgon_target') {
        this.handleDemogorgonTargetSensor(started, gameState);
        return;
      }

      if (role === 'vecna_target') {
        this.handleVecnaTargetSensor(started, gameState);
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

  private beginVecnaFight(targetArmed: boolean): void {
    this.vecnaTriggered = true;
    this.vecnaFightActive = true;
    this.vecnaTargetArmed = targetArmed;
    this.vecnaTargetLatchIgnore = false;
    this.vecnaTargetHits = 0;
    this.vecnaTargetLastHitMs = 0;
  }

  private handleDemogorgonTargetSensor(started: boolean, gameState: string): void {
    if (started) {
      this.demogorgonTargetBallInside = true;
      if (gameState !== 'playing' || !this.demogorgonFightActive || !this.demogorgonTargetArmed) return;
      if (this.demogorgonTargetLatchIgnore) return;

      const now = performance.now();
      if (now - this.demogorgonTargetLastHitMs < 450) return;
      this.demogorgonTargetLastHitMs = now;
      this.demogorgonTargetHits += 1;
      this.emit({
        type: 'DEMOGORGON_TARGET_HIT',
        hitCount: this.demogorgonTargetHits,
        scoreIncrement: SCORE_DEMOGORGON_TARGET,
      });
      if (this.demogorgonTargetHits >= DEMOGORGON_TARGET_HITS) {
        this.demogorgonFightActive = false;
        this.demogorgonTargetArmed = false;
      }
      return;
    }

    this.demogorgonTargetBallInside = false;
    this.demogorgonTargetLatchIgnore = false;
  }

  private handleVecnaTargetSensor(started: boolean, gameState: string): void {
    if (started) {
      this.vecnaTargetBallInside = true;
      if (gameState !== 'playing' || !this.vecnaFightActive || !this.vecnaTargetArmed) return;
      if (this.vecnaTargetLatchIgnore) return;

      const now = performance.now();
      if (now - this.vecnaTargetLastHitMs < 450) return;
      this.vecnaTargetLastHitMs = now;
      this.vecnaTargetHits += 1;
      this.emit({
        type: 'VECNA_TARGET_HIT',
        hitCount: this.vecnaTargetHits,
        scoreIncrement: SCORE_VECNA_TARGET,
      });
      if (this.vecnaTargetHits >= VECNA_TARGET_HITS) {
        this.vecnaFightActive = false;
        this.vecnaTargetArmed = false;
      }
      return;
    }

    this.vecnaTargetBallInside = false;
    this.vecnaTargetLatchIgnore = false;
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
