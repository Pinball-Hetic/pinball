import type { GameEventListener } from '../domain/GameEvents';

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
    this.emit({ type: 'BUMPER_HIT', bumperIndex, scoreIncrement: 100 });
  }
}
