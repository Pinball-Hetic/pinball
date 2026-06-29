import * as THREE from 'three';
import { PlayfieldShadeOverlay, playfieldShadeStrobeOpacity } from '@pinball/game-engine';

export type PlayfieldCinematicStrobeConfig = {
  shadeColor?: number;
  shadeRenderOrder?: number;
  flashColor: number;
  flashIntensity: number;
  flashPosition: THREE.Vector3;
  flashDistance?: number;
  flashDecay?: number;
};

// Version Zelda : pas de GarlandLights ni BumperVisuals (non implémentés).
export class PlayfieldCinematicStrobe {
  private shade = new PlayfieldShadeOverlay();
  private flashLight: THREE.PointLight | null = null;
  private flashRoot: THREE.Object3D | null = null;
  private flashIntensity = 2.4;

  private setFlash(intensity: number): void {
    if (!this.flashLight) return;
    this.flashLight.intensity = intensity;
    if (intensity > 0) {
      if (this.flashRoot && !this.flashLight.parent) this.flashRoot.add(this.flashLight);
    } else if (this.flashLight.parent) {
      this.flashLight.removeFromParent();
    }
  }

  mount(root: THREE.Object3D, config: PlayfieldCinematicStrobeConfig): void {
    this.dispose();
    this.flashIntensity = config.flashIntensity;

    this.shade.mount(root, {
      color: config.shadeColor ?? 0x000000,
      renderOrder: config.shadeRenderOrder ?? 600,
    });

    this.flashLight = new THREE.PointLight(
      config.flashColor,
      0,
      config.flashDistance ?? 0.55,
      config.flashDecay ?? 2,
    );
    this.flashLight.position.copy(config.flashPosition);
    this.flashRoot = root;
  }

  apply(on: boolean, fullMap: boolean, mix: number): void {
    this.shade.setOpacity(playfieldShadeStrobeOpacity(on, fullMap, mix));
    this.setFlash(on && !fullMap ? this.flashIntensity * mix : 0);
  }

  /** Flash sans shade overlay — pour les maps Zelda qui ne veulent pas de voile noir. */
  applyFlashOnly(on: boolean, mix: number): void {
    this.shade.setOpacity(0);
    this.setFlash(on ? this.flashIntensity * mix : 0);
  }

  setShadeOpacity(opacity: number): void {
    this.shade.setOpacity(opacity);
  }

  applyHoldShade(opacity: number): void {
    this.setShadeOpacity(opacity);
    this.setFlash(0);
  }

  applyFightFlicker(shade: number, flashMix: number): void {
    this.shade.setOpacity(shade);
    this.setFlash(this.flashIntensity * flashMix);
  }

  stop(): void {
    this.shade.hide();
    this.setFlash(0);
  }

  dispose(): void {
    this.shade.dispose();
    if (this.flashLight) {
      this.flashLight.dispose();
      this.flashLight.parent?.remove(this.flashLight);
    }
    this.flashLight = null;
    this.flashRoot = null;
    this.shade = new PlayfieldShadeOverlay();
  }
}
