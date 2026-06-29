import type { CollisionHandler } from './CollisionHandler';
import type { GameEventListener } from '../domain/GameEvents';
import type { MapLayout } from '../domain/MapLayout';
import { SCORE_DROP_TARGET, SCORE_DROP_COMPLETE } from '../domain/ScoringConstants';

/**
 * Gère les collisions avec les drop targets (rôle : 'drop_<id>').
 *
 * Machine à états simple par target :
 *   relevé (false) → abattu (true) après le premier contact.
 *
 * Quand tous les targets d'un même côté sont abattus, émet DROP_TARGET_COMPLETE
 * et remet le côté à zéro (les targets se relèvent).
 *
 * Note : le préfixe 'drop_target' est réservé aux colliders visuels/GLB
 * (non interactifs) ; seuls les rôles 'drop_<id>' déclenchent des points.
 */
export class DropTargetCollisionHandler implements CollisionHandler {
  // État courant de chaque drop target : true = abattu, false = relevé.
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
    // Exclut 'drop_target*' (colliders GLB non interactifs).
    return role.startsWith('drop_') && !role.startsWith('drop_target');
  }

  handle(role: string, gameState: string, started: boolean): void {
    if (!started || gameState !== 'playing') return;
    // Idempotent : un target déjà abattu ne donne plus de points.
    if (this.dropTargetDown[role]) return;

    this.dropTargetDown[role] = true;
    this.emit({ type: 'DROP_TARGET_HIT', targetId: role, scoreIncrement: SCORE_DROP_TARGET });

    // Vérifie si tous les targets du même côté sont abattus.
    const target = this.layout.dropTargets.find((t) => t.id === role);
    if (!target) return;

    const sideTargets = this.layout.dropTargets.filter((t) => t.side === target.side);
    const allDown = sideTargets.every((t) => this.dropTargetDown[t.id]);
    if (!allDown) return;

    // Combo complet : bonus + reset du côté.
    this.emit({ type: 'DROP_TARGET_COMPLETE', side: target.side, scoreIncrement: SCORE_DROP_COMPLETE });
    for (const t of sideTargets) this.dropTargetDown[t.id] = false;
  }

  /** Remet tous les drop targets à l'état relevé (appelé au drain/bottom_out). */
  resetDropTargets(): void {
    for (const dt of this.layout.dropTargets) this.dropTargetDown[dt.id] = false;
    this.emit({ type: 'DROP_TARGET_RESET' });
  }
}
