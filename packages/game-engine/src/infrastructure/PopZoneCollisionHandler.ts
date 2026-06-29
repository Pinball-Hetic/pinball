import type { GameEventListener } from '../domain/GameEvents';
import { SCORE_POP_ZONE } from '../domain/ScoringConstants';
import type { CollisionHandler } from './CollisionHandler';

/**
 * Gère les collisions avec les pop zones (rôle : 'pop_zone_<id>').
 *
 * Les pop zones sont des zones de scoring passives (pas d'impulsion physique).
 * Le rôle complet est transmis dans l'événement pour permettre à la map
 * de distinguer plusieurs zones différentes.
 */
export class PopZoneCollisionHandler implements CollisionHandler {
  constructor(
    private readonly emit: GameEventListener,
  ) {}

  canHandle(role: string): boolean {
    return role.startsWith('pop_zone_');
  }

  handle(role: string, gameState: string, started: boolean): void {
    if (!started || gameState !== 'playing') return;
    this.emit({ type: 'ZONE_HIT', zone: role, scoreIncrement: SCORE_POP_ZONE });
  }
}
