import type { IBallPhysics } from './LaunchBall';
import type { GameEventListener } from '../domain/GameEvents';

export class DrainBall {
  private latched = false;

  constructor(
    private readonly ballPhysics: IBallPhysics,
    private readonly emit: GameEventListener,
  ) {}

  resetLatch(): void {
    this.latched = false;
  }

  // Debounce latch: the drain sensor can fire on 2 consecutive frames before
  // the spawn reset takes effect; without this guard, double DRAIN / life loss.
  execute(): void {
    if (this.latched) return;
    this.latched = true;
    this.emit({ type: 'DRAIN' });
    this.ballPhysics.resetToSpawn();
  }
}
