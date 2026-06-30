import type { CollisionHandler } from './CollisionHandler';
import type { GameEventListener } from '../domain/GameEvents';
import type { MapLayout } from '../domain/MapLayout';
import { SCORE_DROP_TARGET, SCORE_DROP_COMPLETE } from '../domain/ScoringConstants';

/**
 * Handles collisions with drop targets (role: 'drop_<id>').
 *
 * Simple per-target state machine:
 *   up (false) → down (true) on first contact.
 *
 * When all targets on the same side are down, emits DROP_TARGET_COMPLETE
 * and resets the side (targets come back up).
 *
 * Note: the 'drop_target' prefix is reserved for visual/GLB colliders
 * (non-interactive); only 'drop_<id>' roles award points.
 */
export class DropTargetCollisionHandler implements CollisionHandler {
  // Current state of each drop target: true = down, false = up.
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
    // Exclude 'drop_target*' (non-interactive GLB colliders).
    return role.startsWith('drop_') && !role.startsWith('drop_target');
  }

  handle(role: string, gameState: string, started: boolean): void {
    if (!started || gameState !== 'playing') return;
    // Idempotent: an already-down target awards no further points.
    if (this.dropTargetDown[role]) return;

    this.dropTargetDown[role] = true;
    this.emit({ type: 'DROP_TARGET_HIT', targetId: role, scoreIncrement: SCORE_DROP_TARGET });

    // Check whether all targets on the same side are now down.
    const target = this.layout.dropTargets.find((t) => t.id === role);
    if (!target) return;

    const sideTargets = this.layout.dropTargets.filter((t) => t.side === target.side);
    const allDown = sideTargets.every((t) => this.dropTargetDown[t.id]);
    if (!allDown) return;

    // Full combo: award bonus and reset the side.
    this.emit({ type: 'DROP_TARGET_COMPLETE', side: target.side, scoreIncrement: SCORE_DROP_COMPLETE });
    for (const t of sideTargets) this.dropTargetDown[t.id] = false;
  }

  /** Resets all drop targets to the up state (called on drain / bottom_out). */
  resetDropTargets(): void {
    for (const dt of this.layout.dropTargets) this.dropTargetDown[dt.id] = false;
    this.emit({ type: 'DROP_TARGET_RESET' });
  }
}
