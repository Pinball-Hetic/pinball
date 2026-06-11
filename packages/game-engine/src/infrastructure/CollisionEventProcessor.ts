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
import { BossTargetSensor } from './BossTargetSensor';

export class CollisionEventProcessor {
  private dropTargetDown: Record<string, boolean> = {};
  private demogorgonTriggered = false;
  private demogorgonTarget = new BossTargetSensor();
  private portalOpen = false;
  private portalTriggered = false;
  private upsideDownActive = false;
  private upsideDownScoreBaseline = 0;
  private vecnaTriggered = false;
  private vecnaTarget = new BossTargetSensor();

  setPortalOpen(open: boolean): void {
    this.portalOpen = open;
    if (!open) this.portalTriggered = false;
  }

  resetPortalTrigger(): void {
    this.portalTriggered = false;
  }

  setDemogorgonFightActive(active: boolean): void {
    this.demogorgonTarget.setFightActive(active);
  }

  setDemogorgonTargetArmed(armed: boolean): void {
    this.demogorgonTarget.setTargetArmed(armed);
  }

  resetDemogorgonFight(): void {
    this.demogorgonTriggered = false;
    this.demogorgonTarget.reset();
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
    this.vecnaTarget.setFightActive(active);
  }

  setVecnaTargetArmed(armed: boolean): void {
    this.vecnaTarget.setTargetArmed(armed);
  }

  resetVecnaFight(): void {
    this.vecnaTriggered = false;
    this.vecnaTarget.reset();
  }

  tryVecnaReveal(totalScore: number, gameState: string): void {
    if (gameState !== 'playing') return;
    if (!this.upsideDownActive) return;
    if (this.vecnaTriggered) return;
    if (totalScore - this.upsideDownScoreBaseline < VECNA_REVEAL_SCORE) return;
    this.beginVecnaFight(false);
    this.emit({ type: 'VECNA_REVEAL', scoreIncrement: SCORE_VECNA_REVEAL });
  }

  /** Dev only — pairs with VECNA_DEBUG_SPAWN_AT_START in playfield. */
  debugStartVecnaFight(score: number): void {
    this.upsideDownActive = true;
    this.upsideDownScoreBaseline = score;
    this.beginVecnaFight(false);
  }

  tryScoreReveal(totalScore: number, gameState: string): void {
    if (gameState !== 'playing') return;
    if (this.demogorgonTriggered) return;
    if (totalScore < DEMOGORGON_REVEAL_SCORE) return;
    this.demogorgonTriggered = true;
    this.demogorgonTarget.beginFight(false);
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
        this.demogorgonTarget.handleCollision(started, gameState, {
          maxHits: DEMOGORGON_TARGET_HITS,
          onHit: (hitCount) => {
            this.emit({
              type: 'DEMOGORGON_TARGET_HIT',
              hitCount,
              scoreIncrement: SCORE_DEMOGORGON_TARGET,
            });
          },
        });
        return;
      }

      if (role === 'vecna_target') {
        this.vecnaTarget.handleCollision(started, gameState, {
          maxHits: VECNA_TARGET_HITS,
          onHit: (hitCount) => {
            this.emit({
              type: 'VECNA_TARGET_HIT',
              hitCount,
              scoreIncrement: SCORE_VECNA_TARGET,
            });
          },
        });
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
    this.vecnaTarget.beginFight(targetArmed);
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
