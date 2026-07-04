import type { IBallPhysics } from './LaunchBall';
import type { GameEventListener } from '../domain/GameEvents';

export class BottomOutBall {
  private latched = false;

  constructor(
    private readonly ballPhysics: IBallPhysics,
    private readonly emit: GameEventListener,
  ) {}

  /**
   * Re-arms the use-case for the next play episode.
   *
   * CONTRACT: the latch is set by `execute()` (sensor/geometric-zone debounce)
   * and MUST be lifted when a new ball enters play, otherwise bottom-out stays
   * dead for the whole session. Two callers cover this contract:
   *  - the `BALL_LAUNCHED` path (normal relaunch),
   *  - `noteRespawn()`, called on every physical ball respawn, including game
   *    reset paths that never go through a launch — guarantees no path can
   *    leave the latch stuck.
   */
  resetLatch(): void {
    this.latched = false;
  }

  /**
   * Call whenever a new ball is (re)placed at the spawn, whatever the path
   * (launch OR game reset). Auto re-arms the latch: safety net so bottom-out
   * never dies because a reset path forgot an explicit `resetLatch()`.
   */
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
