import type { GameEventListener } from '../domain/GameEvents';
import { SCORE_BUMPER } from '../domain/ScoringConstants';

export interface IBumperEject {
  applyEjectionForce(bumperPosition: { x: number; z: number }): void;
}

export class BumperHit {
  constructor(
    private readonly bumperEject: IBumperEject,
    private readonly emit: GameEventListener,
  ) {}

  execute(bumperIndex: number, bumperPosition: { x: number; z: number }): void {
    this.bumperEject.applyEjectionForce(bumperPosition);
    this.emit({ type: 'BUMPER_HIT', bumperIndex, scoreIncrement: SCORE_BUMPER });
  }
}
