import type { CollisionHandler } from './CollisionHandler';
import type { GameEventListener } from '../domain/GameEvents';
import { RETURN_PORTAL_ENTER_SCORE, PORTAL_ENTER_SCORE } from '../domain/Ball';

/**
 * Handles the collision with the portal entrance (role: 'portal_enter').
 *
 * Two-flag state machine:
 *   - portalOpen      : the portal is physically open (activated by the map)
 *   - portalTriggered : already crossed during this opening (prevents double-fire)
 *
 * The emitted event depends on the current world:
 *   - normal world    → PORTAL_ENTER (transition to alternate world)
 *   - alternate world → RETURN_PORTAL_ENTER (return to normal world)
 */
export class PortalCollisionHandler implements CollisionHandler {
  private portalOpen = false;
  private portalTriggered = false;

  constructor(
    private readonly emit: GameEventListener,
    /** Injected getter to read alternate-world state without direct coupling. */
    private readonly getAlternateWorldActive: () => boolean,
  ) {}

  /** Opens or closes the portal. Closing also resets the triggered flag. */
  setPortalOpen(open: boolean): void {
    this.portalOpen = open;
    if (!open) this.portalTriggered = false;
  }

  /** Resets the triggered flag (e.g. after a full world cycle). */
  resetPortalTrigger(): void {
    this.portalTriggered = false;
  }

  canHandle(role: string): boolean {
    return role === 'portal_enter';
  }

  handle(role: string, gameState: string, started: boolean): void {
    if (!started || gameState !== 'playing') return;
    // Ignore if the portal is closed or has already been crossed this opening.
    if (!this.portalOpen || this.portalTriggered) return;

    this.portalTriggered = true;
    if (this.getAlternateWorldActive()) {
      this.emit({ type: 'RETURN_PORTAL_ENTER', scoreIncrement: RETURN_PORTAL_ENTER_SCORE });
    } else {
      this.emit({ type: 'PORTAL_ENTER', scoreIncrement: PORTAL_ENTER_SCORE });
    }
  }
}
