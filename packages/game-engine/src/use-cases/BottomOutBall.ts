import type { IBallPhysics } from './LaunchBall';
import type { GameEventListener } from '../domain/GameEvents';

export class BottomOutBall {
  constructor(
    private readonly ballPhysics: IBallPhysics,
    private readonly emit: GameEventListener,
  ) {}

  execute(): void {
    this.emit({ type: 'BOTTOM_OUT' });
    this.ballPhysics.resetToSpawn();
  }
}
