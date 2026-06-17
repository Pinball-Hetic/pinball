import RAPIER from '@dimforge/rapier3d-compat';
import type { BossId, BossDefinition } from '../domain/BossRegistry';
import {
  bossPointsRemaining,
  bossThresholdMet,
} from '../domain/BossRegistry';
import type { GameEventListener } from '../domain/GameEvents';
import {
  BUMP_EJECT_SCALE,
  BUMP_HIT_COOLDOWN_MS,
  SLINGSHOT_HIT_COOLDOWN_MS,
  RETURN_PORTAL_ENTER_SCORE,
  PORTAL_ENTER_SCORE,
  SLINGSHOT_LEFT_CENTER,
  SLINGSHOT_RIGHT_CENTER,
} from '../domain/Ball';
import type { MapLayout } from '../domain/MapLayout';
import {
  SCORE_SLINGSHOT,
  SCORE_POP_ZONE,
  SCORE_RAMP,
  SCORE_DROP_TARGET,
  SCORE_DROP_COMPLETE,
} from '../domain/ScoringConstants';
import type { BumperHit, IBumperEject } from '../use-cases/BumperHit';
import type { BumpHit } from '../use-cases/BumpHit';
import type { DrainBall } from '../use-cases/DrainBall';
import type { BottomOutBall } from '../use-cases/BottomOutBall';
import { BossFightManager } from './BossFightManager';

export class CollisionEventProcessor {
  private dropTargetDown: Record<string, boolean> = {};
  private readonly bossFights: BossFightManager;
  private readonly bossByRole = new Map<string, BossDefinition>();
  private bumpLastHitMs: Record<'left' | 'right', number> = { left: 0, right: 0 };
  private slingshotLastHitMs: Record<'left' | 'right', number> = { left: 0, right: 0 };
  private portalOpen = false;
  private portalTriggered = false;
  private alternateWorldActive = false;
  private normalWorldScoreBaseline = 0;
  private alternateWorldScoreBaseline = 0;
  private lastTotalScore = 0;
  private lockedHitLastMs: Partial<Record<BossId, number>> = {};
  private pendingPhysics: Array<() => void> = [];

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

  /** Baseline de score monde alternatif (pour recalculer l'état des marqueurs de nid). */
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

  onAlternateWorldEntered(score: number): void {
    this.alternateWorldActive = true;
    this.alternateWorldScoreBaseline = score;
  }

  resetAlternateWorldSession(): void {
    this.alternateWorldActive = false;
    this.alternateWorldScoreBaseline = 0;
    // Réinitialise les combats des boss du monde monde alternatif (génériquement,
    // ceux dont reveal.requiresAlternateWorld — sans id ST en dur).
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
    this.portalTriggered = false;
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
    private readonly bumperHitUC: BumperHit,
    private readonly bumpHitUC: BumpHit,
    private readonly drainBallUC: DrainBall,
    private readonly bottomOutBallUC: BottomOutBall,
    private readonly emit: GameEventListener,
    private readonly slingshotEject: IBumperEject,
  ) {
    this.bossFights = new BossFightManager(emit, layout.bosses);
    for (const b of layout.bosses) this.bossByRole.set(b.colliderRole, b);
    for (const dt of this.layout.dropTargets) this.dropTargetDown[dt.id] = false;
  }

  process(eventQueue: RAPIER.EventQueue, gameState: string): void {
    eventQueue.drainCollisionEvents((h1, h2, started) => {
      const role = this.colliderMap.get(h1) ?? this.colliderMap.get(h2);
      if (!role) return;

      // Contact avec une cible de boss encore verrouillée (palier non atteint) :
      // pédagogie « ENCORE X PTS » plutôt qu'un hit silencieux. Throttle 2 s.
      // Uniquement pour le boss du monde courant : sinon on afficherait un
      // décompte de points trompeur (le vrai blocage est le mauvais monde, pas
      // le score) — ex. cible d'un boss du monde normal touchée dans l'monde alternatif.
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

      if (role === 'portal_enter') {
        if (started && gameState === 'playing' && this.portalOpen && !this.portalTriggered) {
          this.portalTriggered = true;
          if (this.alternateWorldActive) {
            this.emit({ type: 'RETURN_PORTAL_ENTER', scoreIncrement: RETURN_PORTAL_ENTER_SCORE });
          } else {
            this.emit({ type: 'PORTAL_ENTER', scoreIncrement: PORTAL_ENTER_SCORE });
          }
        }
        return;
      }

      if (!started) return;

      if (role.startsWith('bumper_')) {
        const idx = parseInt(role.split('_')[1], 10);
        const pos = this.layout.bumpers[idx];
        if (pos) {
          this.pendingPhysics.push(() => this.bumperHitUC.execute(idx, pos));
        }
      }

      if (started && (role === 'bump_right' || role === 'bump_left') && gameState === 'playing') {
        const side = role === 'bump_right' ? 'right' as const : 'left' as const;
        const now = performance.now();
        if (now - this.bumpLastHitMs[side] >= BUMP_HIT_COOLDOWN_MS) {
          this.bumpLastHitMs[side] = now;
          this.pendingPhysics.push(() => this.bumpHitUC.execute(side, BUMP_EJECT_SCALE));
        }
      }

      if (role === 'bottom_out' && gameState === 'playing') {
        this.pendingPhysics.push(() => {
          this.bottomOutBallUC.execute();
          this.resetDropTargets();
        });
      }

      if (role === 'drain' && gameState === 'playing') {
        this.pendingPhysics.push(() => {
          this.drainBallUC.execute();
          this.resetDropTargets();
        });
      }

      if ((role === 'slingshot_left' || role === 'slingshot_right') && gameState === 'playing') {
        const side = role === 'slingshot_left' ? 'left' as const : 'right' as const;
        const now = performance.now();
        if (now - this.slingshotLastHitMs[side] >= SLINGSHOT_HIT_COOLDOWN_MS) {
          this.slingshotLastHitMs[side] = now;
          const center = side === 'left' ? SLINGSHOT_LEFT_CENTER : SLINGSHOT_RIGHT_CENTER;
          this.pendingPhysics.push(() => this.slingshotEject.applyEjectionForce(center));
          this.emit({ type: 'SLINGSHOT_HIT', side, scoreIncrement: SCORE_SLINGSHOT });
        }
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

  flushPendingPhysics(): void {
    if (this.pendingPhysics.length === 0) return;
    const pending = this.pendingPhysics;
    this.pendingPhysics = [];
    for (const run of pending) run();
  }

  resetDropTargets(): void {
    for (const dt of this.layout.dropTargets) {
      this.dropTargetDown[dt.id] = false;
    }
    this.emit({ type: 'DROP_TARGET_RESET' });
  }

  private handleDropTarget(role: string): void {
    if (this.dropTargetDown[role]) return;

    this.dropTargetDown[role] = true;
    this.emit({ type: 'DROP_TARGET_HIT', targetId: role, scoreIncrement: SCORE_DROP_TARGET });

    const target = this.layout.dropTargets.find((t) => t.id === role);
    if (!target) return;

    const sideTargets = this.layout.dropTargets.filter((t) => t.side === target.side);
    const allDown = sideTargets.every((t) => this.dropTargetDown[t.id]);
    if (!allDown) return;

    this.emit({ type: 'DROP_TARGET_COMPLETE', side: target.side, scoreIncrement: SCORE_DROP_COMPLETE });

    for (const t of sideTargets) {
      this.dropTargetDown[t.id] = false;
    }
  }
}
