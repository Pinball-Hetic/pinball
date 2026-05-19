import RAPIER from '@dimforge/rapier3d-compat';
import type { GameEventListener } from '../domain/GameEvents';
import { BUMPER_POSITIONS, DROP_TARGETS } from '../domain/Ball';
import type { BumperHit } from '../use-cases/BumperHit';
import type { DrainBall } from '../use-cases/DrainBall';

export class CollisionEventProcessor {
  private dropTargetDown: Record<string, boolean> = {};

  constructor(
    private readonly colliderMap: Map<number, string>,
    private readonly bumperHitUC: BumperHit,
    private readonly drainBallUC: DrainBall,
    private readonly emit: GameEventListener,
  ) {
    for (const dt of DROP_TARGETS) this.dropTargetDown[dt.id] = false;
  }

  process(eventQueue: RAPIER.EventQueue, gameState: string): void {
    eventQueue.drainCollisionEvents((h1, h2, started) => {
      if (!started) return;
      const role = this.colliderMap.get(h1) ?? this.colliderMap.get(h2);
      if (!role) return;

      if (role.startsWith('bumper_')) {
        const idx = parseInt(role.split('_')[1], 10);
        const pos = BUMPER_POSITIONS[idx];
        if (pos) {
          this.bumperHitUC.execute(idx, pos);
        }
      }

      if (role === 'drain' && gameState === 'playing') {
        this.drainBallUC.execute();
        this.resetDropTargets();
      }

      if ((role === 'slingshot_left' || role === 'slingshot_right') && gameState === 'playing') {
        const side = role === 'slingshot_left' ? 'left' as const : 'right' as const;
        this.emit({ type: 'SLINGSHOT_HIT', side, scoreIncrement: 10 });
      }

      if (role.startsWith('pop_zone_') && gameState === 'playing') {
        this.emit({ type: 'ZONE_HIT', zone: role, scoreIncrement: 50 });
      }

      if (role === 'rocket_ramp' && gameState === 'playing') {
        this.emit({ type: 'RAMP_HIT', scoreIncrement: 200 });
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
    this.emit({ type: 'DROP_TARGET_HIT', targetId: role, scoreIncrement: 75 });

    const target = DROP_TARGETS.find((t) => t.id === role);
    if (!target) return;

    const sideTargets = DROP_TARGETS.filter((t) => t.side === target.side);
    const allDown = sideTargets.every((t) => this.dropTargetDown[t.id]);
    if (!allDown) return;

    this.emit({ type: 'DROP_TARGET_COMPLETE', side: target.side, scoreIncrement: 500 });

    for (const t of sideTargets) {
      this.dropTargetDown[t.id] = false;
    }
  }
}
