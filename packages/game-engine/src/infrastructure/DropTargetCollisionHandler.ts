import type { CollisionHandler } from './CollisionHandler';
import type { GameEventListener } from '../domain/GameEvents';
import type { MapLayout } from '../domain/MapLayout';
import { SCORE_DROP_TARGET, SCORE_DROP_COMPLETE } from '../domain/ScoringConstants';

export class DropTargetCollisionHandler implements CollisionHandler {
  private dropTargetDown: Record<string, boolean> = {};

  constructor(
    private readonly emit: GameEventListener,
    private readonly layout: MapLayout,
  ) {
    for (const dt of layout.dropTargets) {
      this.dropTargetDown[dt.id] = false;
    }
  }

  canHandle(role: string): boolean {
    // 'drop_target*' are non-interactive GLB colliders; only 'drop_<id>' scores.
    return role.startsWith('drop_') && !role.startsWith('drop_target');
  }

  handle(role: string, gameState: string, started: boolean): void {
    if (!started || gameState !== 'playing') return;
    if (this.dropTargetDown[role]) return;

    this.dropTargetDown[role] = true;
    this.emit({ type: 'DROP_TARGET_HIT', targetId: role, scoreIncrement: SCORE_DROP_TARGET });

    const target = this.layout.dropTargets.find((t) => t.id === role);
    if (!target) return;

    const sideTargets = this.layout.dropTargets.filter((t) => t.side === target.side);
    const allDown = sideTargets.every((t) => this.dropTargetDown[t.id]);
    if (!allDown) return;

    this.emit({ type: 'DROP_TARGET_COMPLETE', side: target.side, scoreIncrement: SCORE_DROP_COMPLETE });
    for (const t of sideTargets) this.dropTargetDown[t.id] = false;
  }

  resetDropTargets(): void {
    for (const k of Object.keys(this.dropTargetDown)) this.dropTargetDown[k] = false;
    this.emit({ type: 'DROP_TARGET_RESET' });
  }
}
