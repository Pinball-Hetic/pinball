// Driven by dt (game time), not wall clock: a wall-clock timer would keep
// running during physics freezes (cinematics, time-scale).
export class RevealCountdown {
  private remainingS = 0;

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

  tick(dt: number): boolean {
    if (this.remainingS <= 0) return false;
    this.remainingS -= dt;
    if (this.remainingS > 0) return false;
    this.remainingS = 0;
    return true;
  }
}
