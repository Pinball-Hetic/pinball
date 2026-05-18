export interface StuckBallResult {
  type: 'nudge' | 'force_drain';
  impulse?: { x: number; y: number; z: number };
}

export class StuckBallDetector {
  private timer = 0;
  private nudgeCount = 0;

  update(
    ballSpeed: number,
    ballPos: { x: number },
    dt: number,
  ): StuckBallResult | null {
    if (ballSpeed < 0.02) {
      this.timer += dt;
      if (this.timer > 1.0) {
        this.timer = 0;
        this.nudgeCount++;
        if (this.nudgeCount >= 3) {
          this.nudgeCount = 0;
          return { type: 'force_drain' };
        }
        const nudgeX = ballPos.x > 0 ? -0.08 : 0.08;
        return { type: 'nudge', impulse: { x: nudgeX, y: 0.02, z: 0.12 } };
      }
      return null;
    }

    this.timer = 0;
    this.nudgeCount = 0;
    return null;
  }

  reset(): void {
    this.timer = 0;
    this.nudgeCount = 0;
  }
}
