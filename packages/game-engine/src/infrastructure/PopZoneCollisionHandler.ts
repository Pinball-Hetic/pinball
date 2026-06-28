import type { GameEventListener } from '../domain/GameEvents';
import { SCORE_POP_ZONE } from '../domain/ScoringConstants';
import type { CollisionHandler } from './CollisionHandler';



  export class PopZoneCollisionHandler implements CollisionHandler {

    constructor(
        private readonly emit: GameEventListener,
    ) {}


    canHandle(role: string): boolean {
        return role.startsWith('pop_zone_')
    }
    handle(role: string, gameState: string, started: boolean): void {
    if (!started || gameState !== 'playing') return;
        this.emit({ type: 'ZONE_HIT', zone: role, scoreIncrement: SCORE_POP_ZONE });
    }
  }
    
    