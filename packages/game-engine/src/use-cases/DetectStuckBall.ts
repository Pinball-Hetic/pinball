export class StuckBallDetector {
  private timer = 0;

  update(
    ballSpeed: number,
    ballPos: { x: number },
    dt: number,
  ): { x: number; y: number; z: number } | null {
    if (ballSpeed < 0.02) {
      this.timer += dt;
      if (this.timer > 1.0) {
        this.timer = 0;
        const nudgeX = ballPos.x > 0 ? -0.08 : 0.08;
        return { x: nudgeX, y: 0.02, z: 0.12 };
      }
      return null;
    }

    this.timer = 0;
    return null;
  }

  reset(): void {
    this.timer = 0;
  }
}
