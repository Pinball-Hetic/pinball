import type { CollisionHandler } from './CollisionHandler';
import type { DrainBall } from '../use-cases/DrainBall';

  
  
  
    export class DrainCollisionHandler implements CollisionHandler {
  
      constructor(
          private readonly pendingPhysics: Array<() => void>,
          private readonly resetDropTargets: () => void,
          private readonly drainBallUC: DrainBall,

      ) {}

  
  
      canHandle(role: string): boolean {
          
        return role === 'drain'
      }
      handle(role: string, gameState: string, started: boolean): void {
      if (!started || gameState !== 'playing') return;
        this.pendingPhysics.push(() => {
        this.drainBallUC.execute();
        this.resetDropTargets();
      });
    }
}
      
      