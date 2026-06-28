import type { CollisionHandler } from './CollisionHandler';
import type { BumperHit } from '../use-cases/BumperHit';
import type { MapLayout } from '../domain/MapLayout';



  export class BumperCollisionHandler implements CollisionHandler {

    constructor(
          private readonly pendingPhysics: Array<() => void>,
          private readonly bumperHitUC:BumperHit,
          private readonly layout: MapLayout,
    ) {}


    canHandle(role: string): boolean {
        return role.startsWith('bumper_') 
    }
    
    handle(role: string, gameState: string, started: boolean): void {
      if (!started) return;
      const idx = parseInt(role.split('_')[1], 10);
      const pos = this.layout.bumpers[idx];
      if (pos) {
          this.pendingPhysics.push(() => this.bumperHitUC.execute(idx, pos));
      }
    }
        
}
