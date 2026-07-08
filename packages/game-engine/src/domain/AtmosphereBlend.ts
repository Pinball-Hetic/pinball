export type AtmosphereTick = {
  mix: number;
  ease: number;
  fullyActive: boolean;
  fullyActivePre: boolean;
  sporeIntensity: number;
};

export class AtmosphereBlend {
  private blendDuration: number;
  mix = 0;
  targetMix = 0;
  visited = false;
  pulseT = 0;
  private lastAppliedMix = -1;

  constructor(blendDuration: number) {
    this.blendDuration = blendDuration;
  }

  isIdle(): boolean {
    return this.mix === 0 && this.targetMix === 0 && !this.visited;
  }

  reset(): void {
    this.mix = 0;
    this.targetMix = 0;
    this.visited = false;
    this.pulseT = 0;
    this.lastAppliedMix = -1;
  }

  shouldApply(t: number): boolean {
    if (Math.abs(t - this.lastAppliedMix) < 0.001) return false;
    this.lastAppliedMix = t;
    return true;
  }

  static ease(t: number): number {
    return t * t * (3 - 2 * t);
  }

  step(dt: number): AtmosphereTick {
    const fullyActivePre = this.mix >= 1 && this.targetMix >= 1;

    this.pulseT += dt;

    const stepAmt = dt / this.blendDuration;
    if (this.mix < this.targetMix) {
      this.mix = Math.min(this.targetMix, this.mix + stepAmt);
    } else if (this.mix > this.targetMix) {
      this.mix = Math.max(this.targetMix, this.mix - stepAmt);
    }

    const fullyActive = this.mix >= 1 && this.targetMix >= 1;

    return {
      mix: this.mix,
      ease: AtmosphereBlend.ease(this.mix),
      fullyActive,
      fullyActivePre,
      sporeIntensity: this.sporeIntensity(),
    };
  }

  private sporeIntensity(): number {
    if (this.mix <= 0) return 0;
    if (this.targetMix >= 1) {
      return this.mix >= 1 ? 1 : Math.max(0, (this.mix - 0.85) / 0.15);
    }
    return this.mix;
  }

  releaseVisitedIfAtRest(): void {
    if (this.mix === 0 && this.targetMix === 0) {
      this.visited = false;
    }
  }
}
