import type { CollisionHandler } from './CollisionHandler';
import type { GameEventListener } from '../domain/GameEvents';
import { RETURN_PORTAL_ENTER_SCORE, PORTAL_ENTER_SCORE } from '../domain/Ball';

export class PortalCollisionHandler implements CollisionHandler {
  private portalOpen = false;
  private portalTriggered = false;

  constructor(
    private readonly emit: GameEventListener,
    private readonly getAlternateWorldActive: () => boolean,
  ) {}

  setPortalOpen(open: boolean): void {
    this.portalOpen = open;
    if (!open) this.portalTriggered = false;
  }

  resetPortalTrigger(): void {
    this.portalTriggered = false;
  }

  canHandle(role: string): boolean {
    return role === 'portal_enter';
  }

  handle(role: string, gameState: string, started: boolean): void {
    if (!started || gameState !== 'playing') return;
    if (!this.portalOpen || this.portalTriggered) return;

    this.portalTriggered = true;
    if (this.getAlternateWorldActive()) {
      this.emit({ type: 'RETURN_PORTAL_ENTER', scoreIncrement: RETURN_PORTAL_ENTER_SCORE });
    } else {
      this.emit({ type: 'PORTAL_ENTER', scoreIncrement: PORTAL_ENTER_SCORE });
    }
  }
}