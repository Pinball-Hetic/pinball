/**
 * Pure cross-fade integrator shared by map atmosphere systems (Stranger Things
 * Upside Down, Zelda Sacred Realm). Owns {mix, targetMix, visited, pulseT,
 * lastAppliedMix} only — NO Three/material/light dependency. Each map class keeps
 * its own setup/dispose and a thin applyEase(ease) that mutates materials/lights.
 *
 * Integration (verbatim from the original update()/applyMix()):
 *  - step = dt / blendDuration ; mix moves toward targetMix, clamped.
 *  - ease = smoothstep(mix) = mix*mix*(3 - 2*mix).
 *  - fullyActive = mix >= 1 && targetMix >= 1.
 *  - lastAppliedMix early-out: skip apply when |mix - lastAppliedMix| < 0.001.
 *  - sporeIntensity ramp (ST): full when mix>=1 while heading active; otherwise a
 *    0.85→1 window when targetMix>=1, else mix itself.
 */

export type AtmosphereTick = {
  mix: number;
  ease: number;
  /** mix >= 1 && targetMix >= 1, computed from the post-step mix. */
  fullyActive: boolean;
  /** mix >= 1 && targetMix >= 1, computed from the pre-step mix (live-pulse gate). */
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

  /** True when fully settled at rest (no transition pending and not visited). */
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

  /** Should applyEase actually run for this mix? (lastAppliedMix early-out). */
  shouldApply(t: number): boolean {
    if (Math.abs(t - this.lastAppliedMix) < 0.001) return false;
    this.lastAppliedMix = t;
    return true;
  }

  static ease(t: number): number {
    return t * t * (3 - 2 * t);
  }

  /** Advance the cross-fade by dt and return per-tick blend factors. */
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

  /** Latch reset once fully back at rest — call after applying. */
  releaseVisitedIfAtRest(): void {
    if (this.mix === 0 && this.targetMix === 0) {
      this.visited = false;
    }
  }
}
