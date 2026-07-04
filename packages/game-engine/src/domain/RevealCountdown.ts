/**
 * Countdown driven by dt (game frames), not wall clock: a
 * setTimeout/performance.now would keep running during physics freezes
 * (cinematics, time-scale), while the delay must follow game time.
 */
export class RevealCountdown {
  private remainingS = 0;

  /** Idempotent: a countdown already running is not overwritten. */
  start(delayS: number): void {
    if (this.remainingS > 0) return;
    this.remainingS = delayS;
  }

  cancel(): void {
    this.remainingS = 0;
  }

  isRunning(): boolean {
    return this.remainingS > 0;
  }

  /** Returns true only on the frame where the delay expires. */
  tick(dt: number): boolean {
    if (this.remainingS <= 0) return false;
    this.remainingS -= dt;
    if (this.remainingS > 0) return false;
    this.remainingS = 0;
    return true;
  }
}
