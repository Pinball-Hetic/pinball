import type { IBallPhysics } from './LaunchBall';
import type { GameEventListener } from '../domain/GameEvents';

export class DrainBall {
  constructor(
    private readonly ballPhysics: IBallPhysics,
    private readonly emit: GameEventListener,
  ) {}

  /** Émet DRAIN et remet la bille au spawn. Le délai visuel est géré par la couche interface. */
  execute(): void {
    this.emit({ type: 'DRAIN' });
    this.ballPhysics.resetToSpawn();
  }
}
