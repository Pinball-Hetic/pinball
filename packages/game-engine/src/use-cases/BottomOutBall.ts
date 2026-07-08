import type { IBallPhysics } from './LaunchBall';
import type { GameEventListener } from '../domain/GameEvents';

export class BottomOutBall {
  private latched = false;

  constructor(
    private readonly ballPhysics: IBallPhysics,
    private readonly emit: GameEventListener,
  ) {}

  // The latch is set by execute() and MUST be lifted when a new ball enters
  // play, or bottom-out stays dead for the whole session.
  resetLatch(): void {
    this.latched = false;
  }

  // Call on every ball respawn (launch OR game reset): safety net so no reset
  // path can leave the latch stuck.
  noteRespawn(): void {
    this.latched = false;
  }

  execute(): void {
    if (this.latched) return;
    this.latched = true;
    this.emit({ type: 'BOTTOM_OUT' });
    this.ballPhysics.resetToSpawn();
  }
}
