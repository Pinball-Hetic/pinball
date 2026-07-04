import type { IBallPhysics } from './LaunchBall';
import type { GameEventListener } from '../domain/GameEvents';

export class DrainBall {
  private latched = false;

  constructor(
    private readonly ballPhysics: IBallPhysics,
    private readonly emit: GameEventListener,
  ) {}

  /**
   * Re-arms the use-case. Call when a new ball enters play (`BALL_LAUNCHED`
   * path), symmetric to `BottomOutBall.resetLatch`.
   */
  resetLatch(): void {
    this.latched = false;
  }

  /**
   * Emits DRAIN and resets the ball to spawn. The visual delay is handled by
   * the interface layer. Debounce latch: the drain sensor (Rapier) can fire
   * `execute()` on 2 consecutive frames before the spawn reset takes effect →
   * without this guard, double DRAIN / double life loss. The latch is lifted
   * by `resetLatch()` when the ball is (re)launched.
   */
  execute(): void {
    if (this.latched) return;
    this.latched = true;
    this.emit({ type: 'DRAIN' });
    this.ballPhysics.resetToSpawn();
  }
}
