import type { GameEventListener } from '../domain/GameEvents';
import { SCORE_BUMP } from '../domain/ScoringConstants';

export interface IBumpEject {
  applyScaledEjectionForce(
    position: { x: number; z: number },
    scale: number,
    side: 'left' | 'right',
  ): void;
}

export class BumpHit {
  constructor(
    private readonly bumpEject: IBumpEject,
    private readonly emit: GameEventListener,
  ) {}

  execute(side: 'left' | 'right', position: { x: number; z: number }, scale: number): void {
    this.bumpEject.applyScaledEjectionForce(position, scale, side);
    this.emit({ type: 'BUMP_HIT', side, scoreIncrement: SCORE_BUMP });
  }
}
