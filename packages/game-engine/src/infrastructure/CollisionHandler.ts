export interface CollisionHandler {
    canHandle(role: string): boolean
    handle(role: string, gameState: string, started: boolean): void
  }