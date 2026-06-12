import * as THREE from 'three';
import type { BossTargetPulseConfig } from '../domain/BossRegistry';

export type BossTargetPulseParts = {
  targetGroup: THREE.Group;
  ringMat: THREE.MeshStandardMaterial | null;
  coreMat: THREE.MeshStandardMaterial | null;
  light: THREE.PointLight | null;
};

export class BossTargetPulse {
  private pulseT = 0;
  private targetHitFlash = 0;

  constructor(
    private readonly config: BossTargetPulseConfig,
    private readonly parts: BossTargetPulseParts,
  ) {}

  flashHit(): void {
    this.targetHitFlash = this.config.hitFlashDuration;
  }

  reset(): void {
    this.pulseT = 0;
    this.targetHitFlash = 0;
    this.parts.targetGroup.scale.setScalar(1);
    this.parts.targetGroup.rotation.z = 0;
  }

  update(dt: number, visible: boolean, paused: boolean): void {
    if (this.targetHitFlash > 0) {
      this.targetHitFlash = Math.max(0, this.targetHitFlash - dt);
    }
    if (!visible || paused) return;

    this.pulseT += dt;
    const hitBoost = this.targetHitFlash > 0 ? this.config.hitBoost : 1;
    const pulse = (0.82 + Math.sin(this.pulseT * this.config.pulseSpeed) * this.config.pulseAmp) * hitBoost;

    if (this.parts.ringMat) {
      this.parts.ringMat.emissiveIntensity = this.config.ringEmissiveBase * pulse;
    }
    if (this.parts.coreMat) {
      this.parts.coreMat.emissiveIntensity = this.config.coreEmissiveBase * pulse;
    }
    if (this.parts.light) {
      this.parts.light.intensity = this.config.lightIntensityBase * pulse;
    }

    this.parts.targetGroup.rotation.z = Math.sin(this.pulseT * this.config.wobbleSpeed) * this.config.wobbleAmp;
    const scale = 1 + (this.targetHitFlash / this.config.hitFlashDuration) * this.config.hitScaleBoost;
    this.parts.targetGroup.scale.setScalar(scale);
  }
}
