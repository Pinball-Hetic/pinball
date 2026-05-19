import type { Plunger } from '../domain/Plunger';
import type { GameEventListener } from '../domain/GameEvents';

export interface IBallPhysics {
  applyPlungerImpulse(factor?: number): void;
  resetToSpawn(): void;
}

export class LaunchBall {
  constructor(
    private readonly ballPhysics: IBallPhysics,
    private readonly plunger: Plunger,
    private readonly emit: GameEventListener,
  ) {}

  execute(factor = 1): void {
    this.plunger.release();
    this.ballPhysics.applyPlungerImpulse(factor);
    this.emit({ type: 'BALL_LAUNCHED' });
  }
}
