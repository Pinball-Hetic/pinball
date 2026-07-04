/**
 * Each collider role has its own dedicated handler.
 * Adding a new role means creating a class that implements this interface
 * and registering it in CollisionEventProcessor — without touching the processor.
 */
export interface CollisionHandler {
  /** Returns true if this handler is responsible for the given collider role. */
  canHandle(role: string): boolean;

  /**
   * Processes the collision event.
   * @param role      - collider role (GLB prefix, e.g. 'bumper_0', 'drain')
   * @param gameState - current game state ('playing', 'game_over', …)
   * @param started   - true = contact started, false = contact ended
   */
  handle(role: string, gameState: string, started: boolean): void;
}
