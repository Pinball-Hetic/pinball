import type { Plunger } from '../domain/Plunger';
import type { GameEventListener } from '../domain/GameEvents';

export interface IBallPhysics {
  applyPlungerImpulse(): void;
  resetToSpawn(): void;
}

export class LaunchBall {
  constructor(
    private readonly ballPhysics: IBallPhysics,
    private readonly plunger: Plunger,
    private readonly emit: GameEventListener,
  ) {}

  execute(): void {
    this.plunger.release();
    this.ballPhysics.applyPlungerImpulse();
    this.emit({ type: 'BALL_LAUNCHED' });
  }
}
