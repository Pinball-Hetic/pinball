


import type { CollisionHandler } from './CollisionHandler';
import type { BottomOutBall } from '../use-cases/BottomOutBall';



  export class BottomOutCollisionHandler implements CollisionHandler {

      constructor(
          private readonly pendingPhysics: Array<() => void>,
          private readonly resetDropTargets: () => void,
          private readonly bottomOutBallUC:BottomOutBall
      ) {}


    canHandle(role: string): boolean {
        return role === 'bottom_out'   
    }
    
    handle(role: string, gameState: string, started: boolean): void {
    if (!started || gameState !== 'playing') return;
    this.pendingPhysics.push(() => {
        this.bottomOutBallUC.execute();
        this.resetDropTargets();
    });
    }
        
}
