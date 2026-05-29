import type { IBallPhysics } from './LaunchBall';
import type { GameEventListener } from '../domain/GameEvents';

export class BottomOutBall {
  private latched = false;

  constructor(
    private readonly ballPhysics: IBallPhysics,
    private readonly emit: GameEventListener,
  ) {}

  resetLatch(): void {
    this.latched = false;
  }

  execute(): void {
    if (this.latched) return;
    this.latched = true;
    this.emit({ type: 'BOTTOM_OUT' });
    this.ballPhysics.resetToSpawn();
  }
}
