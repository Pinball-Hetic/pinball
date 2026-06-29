import type { CollisionHandler } from './CollisionHandler';
import type { GameEventListener } from '../domain/GameEvents';
import { RETURN_PORTAL_ENTER_SCORE, PORTAL_ENTER_SCORE } from '../domain/Ball';

/**
 * Gère la collision avec l'entrée du portail (rôle : 'portal_enter').
 *
 * Machine à états à deux flags :
 *   - portalOpen     : le portail est physiquement ouvert (activé par la map)
 *   - portalTriggered: déjà franchi pendant cette ouverture (évite le double déclenchement)
 *
 * L'événement émis dépend du monde courant :
 *   - monde normal → PORTAL_ENTER (transition vers le monde alternatif)
 *   - monde alternatif → RETURN_PORTAL_ENTER (retour au monde normal)
 */
export class PortalCollisionHandler implements CollisionHandler {
  private portalOpen = false;
  private portalTriggered = false;

  constructor(
    private readonly emit: GameEventListener,
    /** Getter injecté pour lire l'état du monde alternatif sans couplage direct. */
    private readonly getAlternateWorldActive: () => boolean,
  ) {}

  /** Ouvre ou ferme le portail. Fermer réinitialise aussi le flag de déclenchement. */
  setPortalOpen(open: boolean): void {
    this.portalOpen = open;
    if (!open) this.portalTriggered = false;
  }

  /** Réinitialise le flag de déclenchement (ex. après un cycle de monde complet). */
  resetPortalTrigger(): void {
    this.portalTriggered = false;
  }

  canHandle(role: string): boolean {
    return role === 'portal_enter';
  }

  handle(role: string, gameState: string, started: boolean): void {
    if (!started || gameState !== 'playing') return;
    // Ignorer si le portail est fermé ou déjà franchi lors de cette ouverture.
    if (!this.portalOpen || this.portalTriggered) return;

    this.portalTriggered = true;
    if (this.getAlternateWorldActive()) {
      this.emit({ type: 'RETURN_PORTAL_ENTER', scoreIncrement: RETURN_PORTAL_ENTER_SCORE });
    } else {
      this.emit({ type: 'PORTAL_ENTER', scoreIncrement: PORTAL_ENTER_SCORE });
    }
  }
}
